package socks5

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/daniellavrushin/b4/log"
)

// handleUDPAssociate handles the SOCKS5 UDP ASSOCIATE command.
// It registers the client for UDP relay and blocks until the TCP control
// connection closes (per RFC 1928 section 7).
func (s *Server) handleUDPAssociate(conn net.Conn) error {
	clientTCP := conn.RemoteAddr().(*net.TCPAddr)
	// Use "ip:tcpPort" as a unique key to support multiple clients from the same IP.
	assocKey := clientTCP.String()

	if err := sendReply(conn, repSuccess, s.udpConn.LocalAddr()); err != nil {
		return fmt.Errorf("send UDP reply: %w", err)
	}

	log.Debugf("SOCKS5 UDP ASSOCIATE from %s, UDP relay address: %s", assocKey, s.udpConn.LocalAddr())

	doneCh := make(chan struct{})
	var once sync.Once
	assocCancel := func() { once.Do(func() { close(doneCh) }) }

	s.udpAssocsMu.Lock()
	s.udpAssocs[assocKey] = &udpAssoc{
		clientAddr: &net.UDPAddr{IP: clientTCP.IP, Zone: clientTCP.Zone},
		lastActive: time.Now(),
		cancel:     assocCancel,
	}
	s.udpAssocsMu.Unlock()

	// Clear handshake deadline
	conn.SetDeadline(time.Time{})

	// Block until TCP control connection drops or server shuts down
	tcpDone := make(chan struct{})
	go func() {
		buf := make([]byte, 1)
		conn.Read(buf) // blocks until EOF/error
		close(tcpDone)
	}()

	select {
	case <-tcpDone:
	case <-doneCh:
	case <-s.ctx.Done():
	}

	s.udpAssocsMu.Lock()
	delete(s.udpAssocs, assocKey)
	s.udpAssocsMu.Unlock()
	assocCancel()

	log.Debugf("SOCKS5 UDP associate closed: %s", assocKey)
	return nil
}

// udpReadLoop reads UDP packets from the shared listener and dispatches them.
func (s *Server) udpReadLoop() {
	buf := make([]byte, 65535)
	for {
		n, clientAddr, err := s.udpConn.ReadFromUDP(buf)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			log.Errorf("SOCKS5 UDP read: %v", err)
			continue
		}

		// Copy packet data before passing to goroutine
		pkt := make([]byte, n)
		copy(pkt, buf[:n])
		go s.handleUDPPacket(pkt, clientAddr)
	}
}

// handleUDPPacket processes one incoming SOCKS5 UDP packet.
// Format: RSV(2) FRAG(1) ATYP(1) DST.ADDR(var) DST.PORT(2) DATA(var)
func (s *Server) handleUDPPacket(pkt []byte, from *net.UDPAddr) {
	if len(pkt) < 10 { // minimum: 2+1+1+4+2 for IPv4
		return
	}
	if pkt[0] != 0 || pkt[1] != 0 {
		return // reserved must be 0
	}
	if pkt[2] != 0 {
		return // fragmentation not supported
	}

	dest, dataOff, err := parseUDPAddress(pkt)
	if err != nil {
		return
	}

	data := pkt[dataOff:]

	// Check if client has active TCP association
	if !s.hasAssociation(from.IP) {
		return
	}

	// Update last active time
	s.updateAssociation(from.IP)

	// Forward packet and handle response
	s.forwardUDPPacket(data, dest, from)
}

// hasAssociation checks if client IP has an active UDP association
func (s *Server) hasAssociation(ip net.IP) bool {
	s.udpAssocsMu.Lock()
	defer s.udpAssocsMu.Unlock()

	for _, a := range s.udpAssocs {
		if a.clientAddr.IP.Equal(ip) {
			return true
		}
	}
	return false
}

// updateAssociation updates the last active time for client IP
func (s *Server) updateAssociation(ip net.IP) {
	s.udpAssocsMu.Lock()
	defer s.udpAssocsMu.Unlock()

	for _, a := range s.udpAssocs {
		if a.clientAddr.IP.Equal(ip) {
			a.lastActive = time.Now()
			return
		}
	}
}

// forwardUDPPacket forwards a single UDP packet and waits for response
func (s *Server) forwardUDPPacket(data []byte, dest string, clientAddr *net.UDPAddr) {
	destUDP, err := net.ResolveUDPAddr("udp", dest)
	if err != nil {
		return
	}

	// Create connection for this packet
	conn, err := net.DialUDP("udp", nil, destUDP)
	if err != nil {
		return
	}
	defer conn.Close()

	// Send data to destination
	sent, err := conn.Write(data)
	if err != nil {
		return
	}

	// Set read timeout
	readTimeout := time.Duration(s.cfg.UDPReadTimeout) * time.Second
	if readTimeout <= 0 {
		readTimeout = 5 * time.Second
	}
	conn.SetReadDeadline(time.Now().Add(readTimeout))

	// Try to read response
	respBuf := make([]byte, 65535)
	n, _, err := conn.ReadFromUDP(respBuf)
	if err != nil {
		// Timeout is normal for UDP - not all packets expect responses
		return
	}

	// Build SOCKS5 UDP response header + payload
	reply := buildUDPReply(respBuf[:n], destUDP)

	// Send response back to client
	_, err = s.udpConn.WriteToUDP(reply, clientAddr)
	if err != nil {
		log.Errorf("SOCKS5 UDP failed to reply to client %s: %v", clientAddr, err)
		return
	}

	// Log metrics
	s.logUDPMetrics(clientAddr, dest, sent, n)
}

// logUDPMetrics logs UDP connection metrics
func (s *Server) logUDPMetrics(clientAddr *net.UDPAddr, dest string, sent, received int) {
	// Extract client info and destination for logging/metrics
	clientAddrStr := clientAddr.String()
	clientHost := clientAddr.IP.String()
	clientPort := clientAddr.Port

	// Extract domain and destination info
	domain := dest
	destHost, destPortStr, _ := net.SplitHostPort(dest)
	if destHost != "" {
		domain = destHost
	}
	destPort := 0
	if p, err := strconv.Atoi(destPortStr); err == nil {
		destPort = p
	}

	// Match destination against configured sets
	matchedSNI, sniTarget, matchedIP, ipTarget := s.matchDestination(dest)

	// Determine which set to use for metrics
	setName := ""
	if matchedSNI {
		setName = sniTarget
	} else if matchedIP {
		setName = ipTarget
	}

	// Log in CSV format for UI (matching nfq.go format)
	// Format: ,PROTOCOL,sniTarget,host,source:port,ipTarget,destination:port,sourceMac
	// Use P-UDP to indicate proxy traffic
	if !log.IsDiscoveryActive() {
		log.Infof(",P-UDP,%s,%s,%s:%d,%s,%s:%d,", sniTarget, domain, clientHost, clientPort, ipTarget, destHost, destPort)
	}

	// Also log in human-readable format (debug level)
	log.Debugf("[SOCKS5-UDP] Client: %s -> Destination: %s (%d bytes sent, %d bytes received, Set: %s)", clientAddrStr, dest, sent, received, setName)

	// Record connection in metrics for UI display
	m := getMetricsCollector()
	if m != nil {
		matched := matchedSNI || matchedIP
		m.RecordConnection("P-UDP", domain, clientAddrStr, dest, matched, "", setName)
	}
}

// parseUDPAddress extracts the destination address from a SOCKS5 UDP packet.
// Returns the address string and the offset where payload data begins.
func parseUDPAddress(pkt []byte) (addr string, dataOffset int, err error) {
	atyp := pkt[3]
	switch atyp {
	case atypIPv4:
		if len(pkt) < 10 {
			return "", 0, fmt.Errorf("packet too short for IPv4")
		}
		ip := net.IP(pkt[4:8])
		port := binary.BigEndian.Uint16(pkt[8:10])
		return net.JoinHostPort(ip.String(), strconv.Itoa(int(port))), 10, nil

	case atypIPv6:
		if len(pkt) < 22 {
			return "", 0, fmt.Errorf("packet too short for IPv6")
		}
		ip := net.IP(pkt[4:20])
		port := binary.BigEndian.Uint16(pkt[20:22])
		return net.JoinHostPort(ip.String(), strconv.Itoa(int(port))), 22, nil

	case atypDomain:
		if len(pkt) < 5 {
			return "", 0, fmt.Errorf("packet too short for domain length")
		}
		dlen := int(pkt[4])
		end := 5 + dlen + 2
		if len(pkt) < end {
			return "", 0, fmt.Errorf("packet too short for domain")
		}
		domain := string(pkt[5 : 5+dlen])
		port := binary.BigEndian.Uint16(pkt[5+dlen : end])
		return net.JoinHostPort(domain, strconv.Itoa(int(port))), end, nil

	default:
		return "", 0, fmt.Errorf("unsupported address type %d", atyp)
	}
}

// buildUDPReply constructs a SOCKS5 UDP response packet.
func buildUDPReply(data []byte, from *net.UDPAddr) []byte {
	// RSV(2) + FRAG(1) + ATYP(1) + ADDR(4|16) + PORT(2) + DATA
	var hdr []byte
	hdr = append(hdr, 0, 0, 0) // RSV, FRAG

	if ip4 := from.IP.To4(); ip4 != nil {
		hdr = append(hdr, atypIPv4)
		hdr = append(hdr, ip4...)
	} else {
		hdr = append(hdr, atypIPv6)
		hdr = append(hdr, from.IP.To16()...)
	}

	portBuf := make([]byte, 2)
	binary.BigEndian.PutUint16(portBuf, uint16(from.Port))
	hdr = append(hdr, portBuf...)

	return append(hdr, data...)
}

// cleanupLoop removes stale UDP associations periodically.
func (s *Server) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
		}

		timeout := time.Duration(s.cfg.UDPTimeout) * time.Second
		if timeout <= 0 {
			timeout = 5 * time.Minute
		}

		now := time.Now()

		// Clean up stale associations
		s.udpAssocsMu.Lock()
		for key, a := range s.udpAssocs {
			if now.Sub(a.lastActive) > timeout {
				a.cancel()
				delete(s.udpAssocs, key)
			}
		}
		s.udpAssocsMu.Unlock()
	}
}
