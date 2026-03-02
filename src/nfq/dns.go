package nfq

import (
	"encoding/binary"
	"net"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/dns"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/sock"
	"github.com/florianl/go-nfqueue"
)

func (w *Worker) processDnsPacket(ipVersion byte, sport uint16, dport uint16, payload []byte, raw []byte, ihl int, id uint32, srcMac string) int {

	if dport == 53 {
		domain, ok := dns.ParseQueryDomain(payload)
		if ok {
			matcher := w.getMatcher()
			if matchedSet, set := matcher.MatchSNIWithSource(domain, srcMac); matchedSet && set.DNS.Enabled && set.DNS.TargetDNS != "" {

				targetIP := net.ParseIP(set.DNS.TargetDNS)
				if targetIP == nil {
					if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
						log.Tracef("failed to set verdict on packet %d: %v", id, err)
					}
					return 0
				}

				if ipVersion == IPv4 {
					targetDNS := targetIP.To4()
					if targetDNS == nil {
						if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
							log.Tracef("failed to set verdict on packet %d: %v", id, err)
						}
						return 0
					}

					originalDst := make(net.IP, 4)
					copy(originalDst, raw[16:20])

					dns.DnsNATSet(net.IP(raw[12:16]), sport, originalDst)

					copy(raw[16:20], targetDNS)
					sock.FixIPv4Checksum(raw[:ihl])
					sock.FixUDPChecksum(raw, ihl)
					if set.DNS.FragmentQuery {
						w.sendFragmentedDNSQueryV4(set, raw, ihl, targetDNS)
					} else {
						_ = w.sock.SendIPv4(raw, targetDNS)
					}
					if err := w.q.SetVerdict(id, nfqueue.NfDrop); err != nil {
						log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
					}
					log.Infof("DNS redirect: %s -> %s (set: %s)", domain, set.DNS.TargetDNS, set.Name)
					return 0

				} else {
					cfg := w.getConfig()
					if !cfg.Queue.IPv6Enabled {
						if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
							log.Tracef("failed to set verdict on packet %d: %v", id, err)
						}
						return 0
					}

					targetDNS := targetIP.To16()
					if targetDNS == nil {
						if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
							log.Tracef("failed to set verdict on packet %d: %v", id, err)
						}
						return 0
					}

					originalDst := make(net.IP, 16)
					copy(originalDst, raw[24:40])

					dns.DnsNATSet(net.IP(raw[8:24]), sport, originalDst)

					copy(raw[24:40], targetDNS)
					sock.FixUDPChecksumV6(raw)
					if set.DNS.FragmentQuery {
						w.sendFragmentedDNSQueryV6(set, raw, targetDNS)
					} else {
						_ = w.sock.SendIPv6(raw, targetDNS)
					}
					if err := w.q.SetVerdict(id, nfqueue.NfDrop); err != nil {
						log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
					}
					log.Infof("DNS redirect (IPv6): %s -> %s (set: %s)", domain, set.DNS.TargetDNS, set.Name)
					return 0
				}
			}
		}
	}

	if sport == 53 {
		if ipVersion == IPv4 {
			if originalDst, ok := dns.DnsNATGet(net.IP(raw[16:20]), dport); ok {
				copy(raw[12:16], originalDst.To4())
				sock.FixIPv4Checksum(raw[:ihl])
				sock.FixUDPChecksum(raw, ihl)
				dns.DnsNATDelete(net.IP(raw[16:20]), dport)
				_ = w.sock.SendIPv4(raw, net.IP(raw[16:20]))
				if err := w.q.SetVerdict(id, nfqueue.NfDrop); err != nil {
					log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
				}
				return 0
			}
		} else {
			cfg := w.getConfig()
			if cfg.Queue.IPv6Enabled {
				if originalDst, ok := dns.DnsNATGet(net.IP(raw[24:40]), dport); ok {
					copy(raw[8:24], originalDst.To16())
					sock.FixUDPChecksumV6(raw)
					dns.DnsNATDelete(net.IP(raw[24:40]), dport)
					_ = w.sock.SendIPv6(raw, net.IP(raw[24:40]))
					if err := w.q.SetVerdict(id, nfqueue.NfDrop); err != nil {
						log.Tracef("failed to set drop verdict on packet %d: %v", id, err)
					}
					return 0
				}
			}
		}
	}

	if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
		log.Tracef("failed to set verdict on packet %d: %v", id, err)
	}
	return 0
}

func (w *Worker) sendFragmentedDNSQueryV4(cfg *config.SetConfig, raw []byte, ihl int, dst net.IP) {
	udpOffset := ihl
	if len(raw) < ihl+8 {
		_ = w.sock.SendIPv4(raw, dst)
		return
	}
	udpLen := int(binary.BigEndian.Uint16(raw[udpOffset+4 : udpOffset+6]))

	if udpLen < 20 {
		_ = w.sock.SendIPv4(raw, dst)
		return
	}

	dnsPayload := raw[udpOffset+8:]
	if len(dnsPayload) < 12 {
		_ = w.sock.SendIPv4(raw, dst)
		return
	}

	splitPos := findDNSSplitPoint(dnsPayload)
	if splitPos <= 0 {
		splitPos = len(dnsPayload) / 2
	}

	frags, ok := sock.IPv4FragmentUDP(raw, splitPos)
	if !ok {
		log.Tracef("DNS frag: IP fragmentation failed, sending original")
		_ = w.sock.SendIPv4(raw, dst)
		return
	}

	seg2d := config.ResolveSeg2Delay(cfg.UDP.Seg2Delay, cfg.UDP.Seg2DelayMax)

	w.SendTwoSegmentsV4(frags[0], frags[1], dst, seg2d, cfg.Fragmentation.ReverseOrder)

	log.Tracef("DNS frag: sent %d fragments for query", len(frags))
}

func (w *Worker) sendFragmentedDNSQueryV6(cfg *config.SetConfig, raw []byte, dst net.IP) {
	ipv6HdrLen := 40
	if len(raw) < ipv6HdrLen+8 {
		_ = w.sock.SendIPv6(raw, dst)
		return
	}
	udpLen := int(binary.BigEndian.Uint16(raw[ipv6HdrLen+4 : ipv6HdrLen+6]))

	if udpLen < 20 {
		_ = w.sock.SendIPv6(raw, dst)
		return
	}

	dnsPayload := raw[ipv6HdrLen+8:]
	if len(dnsPayload) < 12 {
		_ = w.sock.SendIPv6(raw, dst)
		return
	}

	splitPos := findDNSSplitPoint(dnsPayload)
	if splitPos <= 0 {
		splitPos = len(dnsPayload) / 2
	}

	frags, ok := sock.IPv6FragmentUDP(raw, splitPos)
	if !ok {
		log.Tracef("DNS frag v6: fragmentation failed, sending original")
		_ = w.sock.SendIPv6(raw, dst)
		return
	}

	seg2d := config.ResolveSeg2Delay(cfg.UDP.Seg2Delay, cfg.UDP.Seg2DelayMax)

	w.SendTwoSegmentsV6(frags[0], frags[1], dst, seg2d, cfg.Fragmentation.ReverseOrder)

	log.Tracef("DNS frag v6: sent %d fragments", len(frags))
}

func findDNSSplitPoint(dnsPayload []byte) int {
	if len(dnsPayload) < 13 {
		return -1
	}

	pos := 12
	qnameStart := pos
	qnameEnd := pos

	for pos < len(dnsPayload) {
		labelLen := int(dnsPayload[pos])
		if labelLen == 0 {
			qnameEnd = pos + 1
			break
		}
		if labelLen > 63 || pos+1+labelLen > len(dnsPayload) {
			return len(dnsPayload) / 2
		}
		pos += 1 + labelLen
	}

	if qnameEnd <= qnameStart {
		return len(dnsPayload) / 2
	}

	qnameLen := qnameEnd - qnameStart
	if qnameLen > 4 {
		return qnameStart + qnameLen/2
	}

	return len(dnsPayload) / 2
}
