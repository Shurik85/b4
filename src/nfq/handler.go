package nfq

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/daniellavrushin/b4/capture"
	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/metrics"
	"github.com/daniellavrushin/b4/quic"
	"github.com/daniellavrushin/b4/sni"
	"github.com/daniellavrushin/b4/sock"
	"github.com/daniellavrushin/b4/stun"
	"github.com/daniellavrushin/b4/utils"
	"github.com/florianl/go-nfqueue"
)

// pktInfo holds parsed IP-layer information for a packet being processed.
type pktInfo struct {
	raw    []byte
	ver    uint8
	proto  uint8
	src    net.IP
	dst    net.IP
	srcStr string
	dstStr string
	srcMac string
	ihl    int
}

// accept sets an NfAccept verdict on a packet.
func accept(q *nfqueue.Nfqueue, id uint32) int {
	if err := q.SetVerdict(id, nfqueue.NfAccept); err != nil {
		log.Tracef("failed to set verdict on packet %d: %v", id, err)
	}
	return 0
}

// handlePacket is the main NFQueue packet handler callback.
func (w *Worker) handlePacket(q *nfqueue.Nfqueue, a nfqueue.Attribute, mark uint) int {
	cfg := w.getConfig()
	matcher := w.getMatcher()

	if a.PacketID == nil || a.Payload == nil || len(*a.Payload) == 0 {
		if a.PacketID != nil && q != nil {
			if err := q.SetVerdict(*a.PacketID, nfqueue.NfAccept); err != nil {
				log.Tracef("failed to set verdict on invalid packet %d: %v", *a.PacketID, err)
			}
		}
		return 0
	}

	id := *a.PacketID

	if a.Mark != nil && *a.Mark == uint32(mark) {
		return accept(q, id)
	}

	if !w.matchesInterface(a) {
		return accept(q, id)
	}

	select {
	case <-w.ctx.Done():
		return 0
	default:
	}

	atomic.AddUint64(&w.packetsProcessed, 1)

	pkt, ok := w.parseIPHeaders(*a.Payload)
	if !ok {
		return accept(q, id)
	}

	matched, st := matcher.MatchIPWithSource(pkt.dst, pkt.srcMac)
	var set *config.SetConfig
	if matched {
		set = st
	}

	switch pkt.proto {
	case 6: // TCP
		if len(pkt.raw) >= pkt.ihl+TCPHeaderMinLen {
			return w.handleTCPPacket(q, id, pkt, cfg, matcher, matched, set, st)
		}
	case 17: // UDP
		if len(pkt.raw) >= pkt.ihl+UDPHeaderLen {
			return w.handleUDPPacket(q, id, pkt, cfg, matcher, matched, set, st)
		}
	}

	return accept(q, id)
}

// parseIPHeaders parses IP version, protocol, addresses and header length.
// Returns nil, false if the packet should be accepted without processing.
func (w *Worker) parseIPHeaders(raw []byte) (*pktInfo, bool) {
	v := raw[0] >> 4
	if v != IPv4 && v != IPv6 {
		return nil, false
	}

	p := &pktInfo{raw: raw, ver: v}

	if v == IPv4 {
		if len(raw) < IPv4HeaderMinLen {
			return nil, false
		}
		ihl := int(raw[0]&0x0f) * 4
		if len(raw) < ihl {
			return nil, false
		}

		fragOffset := binary.BigEndian.Uint16(raw[6:8]) & 0x1FFF
		moreFragments := (binary.BigEndian.Uint16(raw[6:8]) & 0x2000) != 0
		if fragOffset != 0 || moreFragments {
			return nil, false
		}

		p.proto = raw[9]
		p.src = net.IP(raw[12:16])
		p.dst = net.IP(raw[16:20])
		p.ihl = ihl
	} else {
		if len(raw) < IPv6HeaderLen {
			return nil, false
		}
		nextHeader := raw[6]
		offset := 40

		for {
			switch nextHeader {
			case 0, 43, 60:
				if len(raw) < offset+2 {
					return nil, false
				}
				nextHeader = raw[offset]
				hdrLen := int(raw[offset+1])*8 + 8
				offset += hdrLen
			case 44:
				return nil, false
			default:
				goto done
			}
		}
	done:
		p.proto = nextHeader
		p.ihl = offset
		p.src = net.IP(raw[8:24])
		p.dst = net.IP(raw[24:40])
	}

	if p.src.IsLoopback() || p.dst.IsLoopback() {
		return nil, false
	}

	p.srcStr = p.src.String()
	p.dstStr = p.dst.String()
	p.srcMac = w.getMacByIp(p.srcStr)

	return p, true
}

// handleTCPPacket processes TCP packets: matching, logging, metrics, and dispatch.
func (w *Worker) handleTCPPacket(q *nfqueue.Nfqueue, id uint32, pkt *pktInfo, cfg *config.Config, matcher *sni.SuffixSet, matched bool, set *config.SetConfig, st *config.SetConfig) int {
	tcp := pkt.raw[pkt.ihl:]
	if len(tcp) < TCPHeaderMinLen {
		return accept(q, id)
	}
	datOff := int((tcp[12]>>4)&0x0f) * 4
	if len(tcp) < datOff {
		return accept(q, id)
	}
	payload := tcp[datOff:]
	sport := binary.BigEndian.Uint16(tcp[0:2])
	dport := binary.BigEndian.Uint16(tcp[2:4])

	if cfg.IsTCPPort(sport) {
		return w.HandleIncoming(q, id, pkt.ver, pkt.raw, pkt.ihl, pkt.src, pkt.dstStr, dport, pkt.srcStr, sport, payload)
	}

	// If IP matched but set has a port filter, verify port matches (AND logic)
	if matched && !set.MatchesTCPDPort(dport) {
		matched = false
		set = nil
	}

	if mLearned, learnedSet, _ := matcher.MatchLearnedIPWithSource(pkt.dst, pkt.srcMac); mLearned {
		if learnedSet.MatchesTCPDPort(dport) {
			matched = true
			set = learnedSet
			st = learnedSet
		}
	}

	// If IP matching didn't find a set, try TCP port-based set matching
	if !matched && cfg.IsTCPPort(dport) {
		if portMatched, portSet := matcher.MatchTCPPort(dport); portMatched {
			matched = true
			set = portSet
		}
	}

	// Packet duplication path: duplicate ALL outgoing TCP packets on configured ports
	// without TLS/SNI parsing. Bypasses DPI evasion entirely.
	if matched && cfg.IsTCPPort(dport) && set.TCP.Duplicate.Enabled && set.TCP.Duplicate.Count > 0 {
		log.Tracef("TCP duplicate to %s:%d (%d copies, set: %s)", pkt.dstStr, dport, set.TCP.Duplicate.Count, set.Name)

		m := metrics.GetMetricsCollector()
		m.RecordConnection("TCP-DUP", "", pkt.srcStr, pkt.dstStr, true, pkt.srcMac, set.Name)
		m.RecordPacket(uint64(len(pkt.raw)))

		if !log.IsDiscoveryActive() {
			log.Infof(",TCP-DUP,,,%s:%d,%s,%s:%d,%s", pkt.srcStr, sport, set.Name, pkt.dstStr, dport, pkt.srcMac)
		}

		if err := q.SetVerdict(id, nfqueue.NfDrop); err != nil {
			log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
			return 0
		}

		for i := 0; i < set.TCP.Duplicate.Count; i++ {
			if pkt.ver == IPv4 {
				_ = w.sock.SendIPv4(pkt.raw, pkt.dst)
			} else {
				_ = w.sock.SendIPv6(pkt.raw, pkt.dst)
			}
		}
		return 0
	}

	tcpFlags := tcp[13]
	isSyn := (tcpFlags & 0x02) != 0
	isAck := (tcpFlags & 0x10) != 0
	isRst := (tcpFlags & 0x04) != 0
	if isRst && cfg.IsTCPPort(dport) {
		log.Tracef("RST received from %s:%d", pkt.dstStr, dport)
	}

	if isSyn && !isAck && cfg.IsTCPPort(dport) && matched && !set.TCP.Duplicate.Enabled {
		log.Tracef("TCP SYN to %s:%d (set: %s)", pkt.dstStr, dport, set.Name)

		m := metrics.GetMetricsCollector()
		m.RecordConnection("TCP-SYN", "", pkt.srcStr, pkt.dstStr, true, pkt.srcMac, set.Name)

		if pkt.ver == IPv4 {
			if set.TCP.SynFake {
				w.sendFakeSyn(set, pkt.raw, pkt.ihl, datOff)
			}
			if set.Fragmentation.Strategy != config.ConfigNone && set.Faking.TCPMD5 {
				w.sendFakeSynWithMD5(set, pkt.raw, pkt.ihl, pkt.dst)
			}
			_ = w.sock.SendIPv4(pkt.raw, pkt.dst)
		} else {
			if set.TCP.SynFake {
				w.sendFakeSynV6(set, pkt.raw, pkt.ihl, datOff)
			}
			if set.Fragmentation.Strategy != config.ConfigNone && set.Faking.TCPMD5 {
				w.sendFakeSynWithMD5V6(set, pkt.raw, pkt.dst)
			}
			_ = w.sock.SendIPv6(pkt.raw, pkt.dst)
		}

		if err := q.SetVerdict(id, nfqueue.NfDrop); err != nil {
			log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
		}
		return 0
	}

	host := ""
	matchedIP := st != nil
	matchedSNI := false
	ipTarget := ""
	sniTarget := ""

	// Show port-matched set name in log
	if !matchedIP && matched && set != nil {
		ipTarget = set.Name
	}

	if cfg.IsTCPPort(dport) && len(payload) > 0 {
		log.Tracef("TCP payload to %s: len=%d, first5=%x", pkt.dstStr, len(payload), payload[:min(5, len(payload))])
		if len(payload) >= 5 && payload[0] == 0x16 {
			log.Tracef("TLS record: type=%x ver=%x%x len=%d", payload[0], payload[1], payload[2],
				int(payload[3])<<8|int(payload[4]))
		}
		connKey := fmt.Sprintf(connKeyFormat, pkt.srcStr, sport, pkt.dstStr, dport)

		host, _ = sni.ParseTLSClientHelloSNI(payload)

		if captureManager := capture.GetManager(cfg); captureManager != nil {
			captureManager.CapturePayload(connKey, host, "tls", payload)
		}

		if host != "" {
			if mSNI, stSNI := matcher.MatchSNIWithSource(host, pkt.srcMac); mSNI {
				// If SNI-matched set has a port filter, verify port matches (AND logic)
				if stSNI.MatchesTCPDPort(dport) {
					matchedSNI = true
					matched = true
					set = stSNI
					matcher.LearnIPToDomain(pkt.dst, host, stSNI)
				}
			}
		}
	}

	if matchedIP {
		ipTarget = st.Name
	}
	if matchedSNI {
		sniTarget = set.Name
	}

	if !log.IsDiscoveryActive() {
		log.Infof(",TCP,%s,%s,%s:%d,%s,%s:%d,%s", sniTarget, host, pkt.srcStr, sport, ipTarget, pkt.dstStr, dport, pkt.srcMac)
	}

	{
		m := metrics.GetMetricsCollector()
		setName := ""
		if matched {
			setName = set.Name
		}
		m.RecordConnection("TCP", host, pkt.srcStr, pkt.dstStr, matched, pkt.srcMac, setName)
		m.RecordPacket(uint64(len(pkt.raw)))
	}

	if matched {
		if set.TCP.Incoming.Mode != config.ConfigOff {
			connKey := fmt.Sprintf(connKeyFormat, pkt.srcStr, sport, pkt.dstStr, dport)
			connState.RegisterOutgoing(connKey, set)
		}

		packetCopy := make([]byte, len(pkt.raw))
		copy(packetCopy, pkt.raw)

		if set.TCP.DropSACK {
			if pkt.ver == 4 {
				packetCopy = sock.StripSACKFromTCP(packetCopy)
			} else {
				packetCopy = sock.StripSACKFromTCPv6(packetCopy)
			}
		}

		dstCopy := make(net.IP, len(pkt.dst))
		copy(dstCopy, pkt.dst)
		setCopy := set

		if err := q.SetVerdict(id, nfqueue.NfDrop); err != nil {
			log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
			return 0
		}

		v := pkt.ver
		w.wg.Add(1)
		go func(s *config.SetConfig, pktData []byte, d net.IP) {
			defer w.wg.Done()
			if v == 4 {
				w.dropAndInjectTCP(s, pktData, d)
			} else {
				w.dropAndInjectTCPv6(s, pktData, d)
			}
		}(setCopy, packetCopy, dstCopy)
		return 0
	}

	return accept(q, id)
}

// handleUDPPacket processes UDP packets: DNS, QUIC, STUN filtering, and dispatch.
func (w *Worker) handleUDPPacket(q *nfqueue.Nfqueue, id uint32, pkt *pktInfo, cfg *config.Config, matcher *sni.SuffixSet, matched bool, set *config.SetConfig, st *config.SetConfig) int {
	udp := pkt.raw[pkt.ihl:]
	if len(udp) < UDPHeaderLen {
		return accept(q, id)
	}

	payload := udp[8:]
	sport := binary.BigEndian.Uint16(udp[0:2])
	dport := binary.BigEndian.Uint16(udp[2:4])
	connKey := fmt.Sprintf(connKeyFormat, pkt.srcStr, sport, pkt.dstStr, dport)

	if sport == 53 || dport == 53 {
		return w.processDnsPacket(pkt.ver, sport, dport, payload, pkt.raw, pkt.ihl, id, pkt.srcMac)
	}

	if utils.IsPrivateIP(pkt.dst) {
		return accept(q, id)
	}

	matchedIP := st != nil
	matchedQUIC := false
	isSTUN := false
	host := ""
	ipTarget := ""
	sniTarget := ""

	// If IP matched but set has a port filter, verify port matches (AND logic)
	if matchedIP && !st.MatchesUDPDPort(dport) {
		matchedIP = false
		matched = false
		set = nil
	}

	if matchedIP {
		ipTarget = st.Name
	}

	if !matchedIP {
		if mLearned, learnedSet, learnedDomain := matcher.MatchLearnedIPWithSource(pkt.dst, pkt.srcMac); mLearned {
			if learnedSet.MatchesUDPDPort(dport) {
				matchedIP = true
				matched = true
				set = learnedSet
				host = learnedDomain
				sniTarget = learnedSet.Name
				ipTarget = learnedSet.Name
			}
		}
	}

	// If IP matching didn't find a set, try UDP port-based set matching
	matchedPort := false
	if !matched {
		if portMatched, portSet := matcher.MatchUDPPort(dport); portMatched {
			matchedPort = true
			matched = true
			set = portSet
			ipTarget = portSet.Name
		}
	}

	isSTUN = stun.IsSTUNMessage(payload)

	if host == "" {
		if h, ok := sni.ParseQUICClientHelloSNI(payload); ok {
			host = h
		}
	}

	if host != "" {
		if mSNI, sniSet := matcher.MatchSNIWithSource(host, pkt.srcMac); mSNI {
			// If SNI-matched set has a port filter, verify port matches (AND logic)
			if sniSet.MatchesUDPDPort(dport) {
				matchedQUIC = true
				set = sniSet
				sniTarget = sniSet.Name
				matcher.LearnIPToDomain(pkt.dst, host, sniSet)
			}
		}
	}

	if !matchedQUIC && (matchedIP || matchedPort) && set.UDP.FilterQUIC == "all" {
		if quic.IsInitial(payload) {
			matchedQUIC = true
		}
	}

	if captureManager := capture.GetManager(cfg); captureManager != nil {
		captureManager.CapturePayload(connKey, host, "quic", payload)
	}

	shouldHandle := (matchedIP || matchedQUIC || matchedPort) && !(isSTUN && set.UDP.FilterSTUN)

	matched = shouldHandle

	if !log.IsDiscoveryActive() {
		log.Infof(",UDP,%s,%s,%s:%d,%s,%s:%d,%s", sniTarget, host, pkt.srcStr, sport, ipTarget, pkt.dstStr, dport, pkt.srcMac)
	}

	if isSTUN && set != nil && set.UDP.FilterSTUN {
		return accept(q, id)
	}

	if !shouldHandle {
		m := metrics.GetMetricsCollector()
		m.RecordConnection("UDP", host, pkt.srcStr, pkt.dstStr, false, pkt.srcMac, "")
		m.RecordPacket(uint64(len(pkt.raw)))
		return accept(q, id)
	}

	m := metrics.GetMetricsCollector()
	setName := ""
	if matched {
		setName = set.Name
	}
	m.RecordConnection("UDP", host, pkt.srcStr, pkt.dstStr, matched, pkt.srcMac, setName)
	m.RecordPacket(uint64(len(pkt.raw)))

	switch set.UDP.Mode {
	case "drop":
		if err := q.SetVerdict(id, nfqueue.NfDrop); err != nil {
			log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
		}
		return 0

	case "fake":
		packetCopy := make([]byte, len(pkt.raw))
		copy(packetCopy, pkt.raw)
		dstCopy := make(net.IP, len(pkt.dst))
		copy(dstCopy, pkt.dst)
		setCopy := set

		if err := q.SetVerdict(id, nfqueue.NfDrop); err != nil {
			log.Tracef("failed to set drop verdict on UDP packet %d: %v", id, err)
			return 0
		}

		v := pkt.ver
		w.wg.Add(1)
		go func(s *config.SetConfig, p []byte, d net.IP) {
			defer w.wg.Done()
			if v == IPv4 {
				w.dropAndInjectQUIC(s, p, d)
			} else {
				w.dropAndInjectQUICV6(s, p, d)
			}
		}(setCopy, packetCopy, dstCopy)
		return 0

	default:
		return accept(q, id)
	}
}

// handleNfqError handles errors from the NFQueue subsystem.
func (w *Worker) handleNfqError(e error) int {
	if w.ctx.Err() != nil {
		if errors.Is(e, syscall.ENOBUFS) {
			now := time.Now().Unix()
			last := atomic.LoadInt64(&w.lastOverflowLog)
			if now-last >= 5 {
				if atomic.CompareAndSwapInt64(&w.lastOverflowLog, last, now) {
					log.Warnf("nfq queue %d overflow - packets dropped", w.qnum)
				}
			}
			return 0
		}
		return 0
	}
	if errors.Is(e, os.ErrClosed) || errors.Is(e, net.ErrClosed) || errors.Is(e, syscall.EBADF) {
		return 0
	}
	if ne, ok := e.(net.Error); ok && ne.Timeout() {
		return 0
	}
	msg := e.Error()
	if strings.Contains(msg, "use of closed file") || strings.Contains(msg, "file descriptor") {
		return 0
	}
	log.Errorf("nfq: %v", e)
	return 0
}
