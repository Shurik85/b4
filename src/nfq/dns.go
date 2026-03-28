package nfq

import (
	"encoding/binary"
	"net"
	"strings"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/dns"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/sock"
	"github.com/florianl/go-nfqueue"
)

// parseDNSName parses a DNS domain name from msg starting at the given offset.
func parseDNSName(msg []byte, offset int) (string, bool) {
	if offset < 0 || offset >= len(msg) {
		return "", false
	}
	var labels []string
	i := offset
	const maxSteps = 256
	steps := 0
	for {
		if steps >= maxSteps || i >= len(msg) {
			return "", false
		}
		steps++
		l := int(msg[i])
		if l == 0 {
			break
		}

		if l&0xC0 == 0xC0 {
			if i+1 >= len(msg) {
				return "", false
			}
			ptr := int(l&0x3F)<<8 | int(msg[i+1])
			if ptr >= len(msg) {
				return "", false
			}
			i = ptr
			continue
		}

		if i+1+l > len(msg) {
			return "", false
		}
		labels = append(labels, string(msg[i+1:i+1+l]))
		i += 1 + l
	}
	if len(labels) == 0 {
		return "", false
	}
	return strings.Join(labels, "."), true
}

func (w *Worker) processDnsPacket(ipVersion byte, sport uint16, dport uint16, payload []byte, raw []byte, ihl int, id uint32, srcMac string) int {

	if dport == 53 {
		domain, ok := dns.ParseQueryDomain(payload)
		txid, txidOK := dns.ParseTransactionID(payload)
		if ok {
			domain = strings.ToLower(domain)
			matcher := w.getMatcher()
			if matchedSet, set := matcher.MatchSNIWithSource(domain, srcMac); matchedSet {
				cfg := w.getConfig()
				if txidOK && set.Routing.Enabled && !cfg.Queue.IsDiscovery {
					var clientIP, dnsServerIP net.IP
					switch ipVersion {
					case IPv4:
						clientIP = net.IP(raw[12:16])
						dnsServerIP = net.IP(raw[16:20])
					case IPv6:
						clientIP = net.IP(raw[8:24])
						dnsServerIP = net.IP(raw[24:40])
					}
					if clientIP != nil {
						storeDNSPendingRoute(
							dnsRouteKeyRequest(ipVersion, clientIP, sport, dnsServerIP, dport, txid, domain),
							set.Id,
						)

						if set.DNS.Enabled && set.DNS.TargetDNS != "" {
							if redirectIP := net.ParseIP(set.DNS.TargetDNS); redirectIP != nil {
								storeDNSPendingRoute(
									dnsRouteKeyRequest(ipVersion, clientIP, sport, redirectIP, dport, txid, domain),
									set.Id,
								)
							}
						}
					}
				}
				if !(set.DNS.Enabled && set.DNS.TargetDNS != "") {
					if err := w.q.SetVerdict(id, nfqueue.NfAccept); err != nil {
						log.Tracef("failed to set verdict on packet %d: %v", id, err)
					}
					return 0
				}

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

					if !cfg.Queue.IsDiscovery {
						dns.DnsNATSet(net.IP(raw[12:16]), sport, originalDst)
					}

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

					if !cfg.Queue.IsDiscovery {
						dns.DnsNATSet(net.IP(raw[8:24]), sport, originalDst)
					}

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
		if txid, ok := dns.ParseTransactionID(payload); ok {
			domain, _ := dns.ParseQueryDomain(payload)
			if domain == "" {
				if d, ok := parseDNSName(payload, 12); ok {
					domain = d
				}
			}
			domain = strings.ToLower(domain)
			var clientIP net.IP
			var dnsServerIP net.IP
			if ipVersion == IPv4 {
				clientIP = net.IP(raw[16:20])
				dnsServerIP = net.IP(raw[12:16])
			} else {
				clientIP = net.IP(raw[24:40])
				dnsServerIP = net.IP(raw[8:24])
			}

			if setID, hit := consumeDNSPendingRoute(
				dnsRouteKeyResponse(ipVersion, clientIP, dport, dnsServerIP, sport, txid, domain),
			); hit {
				if ips := dns.ParseResponseIPs(payload); len(ips) > 0 {
					cfg := w.getConfig()
					if set := cfg.GetSetById(setID); set != nil {
						if RoutingHandleDNSFunc != nil && !cfg.Queue.IsDiscovery {
							RoutingHandleDNSFunc(cfg, set, ips)
						}
					}
				}
			}
		}

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
