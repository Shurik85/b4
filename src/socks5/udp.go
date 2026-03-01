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

	// Find the association for this client
	assoc := s.findAssoc(from)
	if assoc == nil {
		return
	}

	// Update client's actual UDP source port (may differ from TCP port)
	s.udpAssocsMu.Lock()
	assoc.clientAddr.Port = from.Port
	assoc.lastActive = time.Now()
	s.udpAssocsMu.Unlock()

	s.forwardUDP(data, dest, from)
}

// findAssoc returns the UDP association for the given client address.
// It matches by IP since UDP source port differs from the TCP control port.
func (s *Server) findAssoc(addr *net.UDPAddr) *udpAssoc {
	s.udpAssocsMu.Lock()
	defer s.udpAssocsMu.Unlock()

	for _, a := range s.udpAssocs {
		if a.clientAddr.IP.Equal(addr.IP) {
			return a
		}
	}
	return nil
}

// findAssocByIP returns the UDP association for the given client IP.
func (s *Server) findAssocByIP(ip net.IP) *udpAssoc {
	s.udpAssocsMu.Lock()
	defer s.udpAssocsMu.Unlock()

	for _, a := range s.udpAssocs {
		if a.clientAddr.IP.Equal(ip) {
			return a
		}
	}
	return nil
}

// forwardUDP sends the payload to the destination.
// Uses a shared connection per destination to properly handle responses.
func (s *Server) forwardUDP(data []byte, dest string, clientAddr *net.UDPAddr) {
	destUDP, err := net.ResolveUDPAddr("udp", dest)
	if err != nil {
		return
	}

	// Get or create a relay connection for this destination
	relay := s.getOrCreateRelay(dest, destUDP, clientAddr)
	if relay == nil {
		return
	}

	// Send data to destination
	sent, err := relay.conn.Write(data)
	if err != nil {
		return
	}

	relay.mu.Lock()
	relay.bytesSent += sent
	relay.lastActive = time.Now()
	relay.mu.Unlock()
}

// getOrCreateRelay gets or creates a UDP relay connection for a destination
func (s *Server) getOrCreateRelay(dest string, destAddr *net.UDPAddr, clientAddr *net.UDPAddr) *udpRelay {
	s.udpRelaysMu.Lock()
	defer s.udpRelaysMu.Unlock()

	// Use client IP + destination as key to support multiple clients
	relayKey := clientAddr.IP.String() + "->" + dest

	if relay, exists := s.udpRelays[relayKey]; exists {
		return relay
	}

	// Create new relay connection
	conn, err := net.DialUDP("udp", nil, destAddr)
	if err != nil {
		return nil
	}

	relay := &udpRelay{
		conn:       conn,
		destAddr:   destAddr,
		clientAddr: clientAddr,
		dest:       dest,
		lastActive: time.Now(),
	}

	s.udpRelays[relayKey] = relay

	// Start response handler for this relay
	go s.handleUDPRelay(relay, relayKey)

	return relay
}

// handleUDPRelay continuously reads responses from destination and forwards to client
func (s *Server) handleUDPRelay(relay *udpRelay, relayKey string) {
	defer func() {
		relay.conn.Close()
		s.udpRelaysMu.Lock()
		delete(s.udpRelays, relayKey)
		s.udpRelaysMu.Unlock()
	}()

	buf := make([]byte, 65535)
	for {
		// Set read deadline
		readTimeout := time.Duration(s.cfg.UDPReadTimeout) * time.Second
		if readTimeout <= 0 {
			readTimeout = 5 * time.Second
		}
		relay.conn.SetReadDeadline(time.Now().Add(readTimeout))

		n, _, err := relay.conn.ReadFromUDP(buf)
		if err != nil {
			// Check if server is shutting down
			select {
			case <-s.ctx.Done():
				return
			default:
			}

			// Timeout - check if relay is still active
			relay.mu.Lock()
			inactive := time.Since(relay.lastActive)
			relay.mu.Unlock()

			if inactive > 30*time.Second {
				return
			}
			continue
		}

		// Get current client address from association (may have changed port)
		assoc := s.findAssocByIP(relay.clientAddr.IP)
		if assoc == nil {
			// Association closed, stop relay
			return
		}

		s.udpAssocsMu.Lock()
		currentClientAddr := &net.UDPAddr{
			IP:   assoc.clientAddr.IP,
			Port: assoc.clientAddr.Port,
			Zone: assoc.clientAddr.Zone,
		}
		s.udpAssocsMu.Unlock()

		// Build SOCKS5 UDP response header + payload
		reply := buildUDPReply(buf[:n], relay.destAddr)

		// Send response back to client using current address
		_, err = s.udpConn.WriteToUDP(reply, currentClientAddr)
		if err != nil {
			log.Errorf("SOCKS5 UDP failed to reply to client %s: %v", currentClientAddr, err)
			continue
		}

		relay.mu.Lock()
		relay.bytesRecv += n
		relay.lastActive = time.Now()
		relay.mu.Unlock()

		// Log metrics with current client address
		s.logUDPMetrics(currentClientAddr, relay.dest, relay.bytesSent, n)
	}
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

// cleanupLoop removes stale UDP associations and relays periodically.
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

		// Clean up stale relays
		s.udpRelaysMu.Lock()
		for key, r := range s.udpRelays {
			r.mu.Lock()
			inactive := now.Sub(r.lastActive)
			r.mu.Unlock()

			if inactive > timeout {
				r.conn.Close()
				delete(s.udpRelays, key)
			}
		}
		s.udpRelaysMu.Unlock()
	}
}
