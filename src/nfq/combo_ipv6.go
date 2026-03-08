package nfq

import (
	"encoding/binary"
	"net"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/sock"
	"github.com/daniellavrushin/b4/utils"
)

func (w *Worker) sendComboFragmentsV6(cfg *config.SetConfig, packet []byte, dst net.IP) {
	pi, ok := ExtractPacketInfoV6(packet)
	if !ok || pi.PayloadLen < 20 {
		_ = w.sock.SendIPv6(packet, dst)
		return
	}

	combo := &cfg.Fragmentation.Combo

	if combo.DecoyEnabled {
		w.sendDecoyPacketV6(cfg, packet, pi, dst)
	}

	splits := GetComboSplitPoints(pi.Payload, pi.PayloadLen, combo, cfg.Fragmentation.MiddleSNI)
	splits = uniqueSorted(splits, pi.PayloadLen)
	if len(splits) < 1 {
		splits = []int{pi.PayloadLen / 2}
	}

	seqovlPattern := cfg.Fragmentation.SeqOverlapBytes
	seqovlLen := len(seqovlPattern)

	segments := make([]Segment, 0, len(splits)+1)
	prevEnd := 0

	for _, splitPos := range splits {
		if splitPos <= prevEnd {
			continue
		}
		seg := BuildSegmentV6(packet, pi, pi.Payload[prevEnd:splitPos], uint32(prevEnd))
		segments = append(segments, Segment{Data: seg, Seq: pi.Seq0 + uint32(prevEnd)})
		prevEnd = splitPos
	}

	if prevEnd < pi.PayloadLen {
		seg := BuildSegmentV6(packet, pi, pi.Payload[prevEnd:], uint32(prevEnd))
		segments = append(segments, Segment{Data: seg, Seq: pi.Seq0 + uint32(prevEnd)})
	}

	if len(segments) == 0 {
		_ = w.sock.SendIPv6(packet, dst)
		return
	}

	r := utils.NewRand()
	ShuffleSegments(segments, combo.ShuffleMode, r)
	SetMaxSeqPSH(segments, pi.IPHdrLen, sock.FixTCPChecksumV6)

	firstDelayMs := combo.FirstDelayMs
	if firstDelayMs <= 0 {
		firstDelayMs = 100
	}
	jitterMaxUs := combo.JitterMaxUs
	if jitterMaxUs <= 0 {
		jitterMaxUs = 2000
	}

	fakePerSeg := combo.FakePerSegment
	fakePerSegCount := combo.FakePerSegCount
	if fakePerSegCount <= 0 {
		fakePerSegCount = 1
	} else if fakePerSegCount > 11 {
		fakePerSegCount = 11
	}

	for i, seg := range segments {
		sendFake := (fakePerSeg || i == 0) && seqovlLen > 0
		if sendFake {
			payloadLen := len(seg.Data) - pi.PayloadStart
			if seqovlLen <= payloadLen {
				seqOffset := seg.Seq - pi.Seq0
				for f := 0; f < fakePerSegCount; f++ {
					fakeSeg := BuildFakeOverlapSegmentV6(packet, pi, payloadLen, seqOffset, seqovlPattern, cfg.Faking.TTL, true)
					if fakeSeg != nil {
						_ = w.sock.SendIPv6(fakeSeg, dst)
						time.Sleep(50 * time.Microsecond)
					}
				}
			}
		}

		_ = w.sock.SendIPv6(seg.Data, dst)

		if i == 0 {
			jitter := r.Intn(firstDelayMs/3 + 1)
			time.Sleep(time.Duration(firstDelayMs+jitter) * time.Millisecond)
		} else if i < len(segments)-1 {
			time.Sleep(time.Duration(r.Intn(jitterMaxUs)) * time.Microsecond)
		}
	}
}

func (w *Worker) sendDecoyPacketV6(cfg *config.SetConfig, packet []byte, pi PacketInfo, dst net.IP) {
	log.Tracef("sendDecoyPacketV6: Sending decoy fragment packet to %s, set: %s", dst.String(), cfg.Name)
	fakeBlob := sock.GetPayload(&cfg.Faking)

	if len(fakeBlob) < 3 {
		log.Warnf("Not enough fake payload for fragmentation, need at least 3 bytes")
		return
	}

	if len(fakeBlob) > 680 {
		fakeBlob = fakeBlob[:680]
	}

	// Build fake packet with this blob as payload
	fakePacket := make([]byte, pi.PayloadStart+len(fakeBlob))
	copy(fakePacket[:pi.PayloadStart], packet[:pi.PayloadStart])
	copy(fakePacket[pi.PayloadStart:], fakeBlob)

	// Update IPv6 payload length
	binary.BigEndian.PutUint16(fakePacket[4:6], uint16(len(fakePacket)-40))

	// Set low hop limit so it won't reach server
	hopLimit := cfg.Faking.TTL
	if hopLimit == 0 {
		hopLimit = 3
	}
	fakePacket[7] = hopLimit

	sock.FixTCPChecksumV6(fakePacket)

	splitPos := 2

	// Segment 1: first 2 bytes
	seg1 := BuildSegmentV6(fakePacket, pi, fakeBlob[:splitPos], 0)
	ClearPSH(seg1, pi.IPHdrLen)
	sock.FixTCPChecksumV6(seg1)

	// Segment 2: rest of fake blob
	seg2 := BuildSegmentV6(fakePacket, pi, fakeBlob[splitPos:], uint32(splitPos))

	_ = w.sock.SendIPv6(seg1, dst)
	time.Sleep(50 * time.Microsecond)
	_ = w.sock.SendIPv6(seg2, dst)

	if seg2d := config.ResolveSeg2Delay(cfg.TCP.Seg2Delay, cfg.TCP.Seg2DelayMax); seg2d > 0 {
		time.Sleep(time.Duration(seg2d) * time.Millisecond)
	}
}
