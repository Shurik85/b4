package socks5

import (
	"context"
	"crypto/subtle"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/metrics"
	"github.com/daniellavrushin/b4/sni"
)

// SOCKS5 protocol constants (RFC 1928, RFC 1929)
const (
	socks5Version = 0x05

	// Auth methods
	authNone       = 0x00
	authUserPass   = 0x02
	authNoAccept   = 0xFF
	authSubVersion = 0x01

	// Commands
	cmdConnect      = 0x01
	cmdUDPAssociate = 0x03

	// Address types
	atypIPv4   = 0x01
	atypDomain = 0x03
	atypIPv6   = 0x04

	// Reply codes
	repSuccess          = 0x00
	repServerFailure    = 0x01
	repHostUnreachable  = 0x04
	repCmdNotSupported  = 0x07
	repAddrNotSupported = 0x08

	// Limits
	maxConnections = 1024
	handshakeTime  = 30 * time.Second
	dialTimeout    = 10 * time.Second
)

// Server is a SOCKS5 proxy server.
type Server struct {
	cfg      *config.Socks5Config
	fullCfg  *config.Config
	listener net.Listener
	udpConn  *net.UDPConn

	ctx    context.Context
	cancel context.CancelFunc

	activeConns atomic.Int64
	connSem     chan struct{} // semaphore for connection limiting

	udpAssocs   map[string]*udpAssoc
	udpAssocsMu sync.Mutex
}

type udpAssoc struct {
	clientAddr *net.UDPAddr
	lastActive time.Time
	cancel     context.CancelFunc
}

// NewServer creates a new SOCKS5 server.
func NewServer(cfg *config.Socks5Config, fullCfg *config.Config) *Server {
	return &Server{
		cfg:       cfg,
		fullCfg:   fullCfg,
		connSem:   make(chan struct{}, maxConnections),
		udpAssocs: make(map[string]*udpAssoc),
	}
}

// Start begins listening for SOCKS5 connections. Returns nil immediately if disabled.
func (s *Server) Start() error {
	if !s.cfg.Enabled {
		log.Infof("SOCKS5 server disabled")
		return nil
	}

	addr := net.JoinHostPort(s.cfg.BindAddress, strconv.Itoa(s.cfg.Port))
	s.ctx, s.cancel = context.WithCancel(context.Background())

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("SOCKS5 TCP listen: %w", err)
	}
	s.listener = ln

	udpAddr, err := net.ResolveUDPAddr("udp", addr)
	if err != nil {
		ln.Close()
		return fmt.Errorf("SOCKS5 UDP resolve: %w", err)
	}
	uc, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		ln.Close()
		return fmt.Errorf("SOCKS5 UDP listen: %w", err)
	}
	s.udpConn = uc

	log.Infof("SOCKS5 server listening on %s (TCP+UDP)", addr)

	go s.acceptLoop()
	go s.udpReadLoop()
	go s.cleanupLoop()

	return nil
}

// Stop gracefully shuts down the SOCKS5 server.
func (s *Server) Stop() error {
	if s.cancel != nil {
		s.cancel()
	}

	var firstErr error
	if s.listener != nil {
		if err := s.listener.Close(); err != nil {
			firstErr = err
		}
	}
	if s.udpConn != nil {
		if err := s.udpConn.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	s.udpAssocsMu.Lock()
	for _, a := range s.udpAssocs {
		a.cancel()
	}
	s.udpAssocs = make(map[string]*udpAssoc)
	s.udpAssocsMu.Unlock()

	return firstErr
}

// --- TCP accept loop ---

func (s *Server) acceptLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			log.Errorf("SOCKS5 accept: %v", err)
			continue
		}

		// Enforce connection limit via semaphore
		select {
		case s.connSem <- struct{}{}:
		default:
			log.Tracef("SOCKS5 connection limit reached, rejecting %s", conn.RemoteAddr())
			conn.Close()
			continue
		}

		s.activeConns.Add(1)
		go func() {
			defer func() {
				conn.Close()
				<-s.connSem
				s.activeConns.Add(-1)
			}()
			s.handleConn(conn)
		}()
	}
}

func (s *Server) handleConn(conn net.Conn) {
	conn.SetDeadline(time.Now().Add(handshakeTime))

	if err := s.authenticate(conn); err != nil {
		log.Tracef("SOCKS5 auth failed from %s: %v", conn.RemoteAddr(), err)
		return
	}

	if err := s.handleRequest(conn); err != nil {
		log.Tracef("SOCKS5 request failed from %s: %v", conn.RemoteAddr(), err)
	}
}

// --- Authentication (RFC 1928 + RFC 1929) ---

func (s *Server) authenticate(conn net.Conn) error {
	// Read version + method count
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		return fmt.Errorf("read greeting: %w", err)
	}
	if hdr[0] != socks5Version {
		return fmt.Errorf("unsupported version %d", hdr[0])
	}

	methods := make([]byte, hdr[1])
	if _, err := io.ReadFull(conn, methods); err != nil {
		return fmt.Errorf("read methods: %w", err)
	}

	needAuth := s.cfg.Username != "" && s.cfg.Password != ""
	var chosen byte = authNoAccept

	if needAuth {
		for _, m := range methods {
			if m == authUserPass {
				chosen = authUserPass
				break
			}
		}
	} else {
		for _, m := range methods {
			if m == authNone {
				chosen = authNone
				break
			}
		}
	}

	if _, err := conn.Write([]byte{socks5Version, chosen}); err != nil {
		return fmt.Errorf("write method selection: %w", err)
	}
	if chosen == authNoAccept {
		return fmt.Errorf("no acceptable auth method")
	}
	if chosen == authUserPass {
		return s.subnegotiateUserPass(conn)
	}
	return nil
}

func (s *Server) subnegotiateUserPass(conn net.Conn) error {
	// RFC 1929: VER(1) ULEN(1) UNAME(1-255) PLEN(1) PASSWD(1-255)
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		return fmt.Errorf("read auth header: %w", err)
	}
	if hdr[0] != authSubVersion {
		return fmt.Errorf("unsupported auth sub-version %d", hdr[0])
	}

	uname := make([]byte, hdr[1])
	if _, err := io.ReadFull(conn, uname); err != nil {
		return fmt.Errorf("read username: %w", err)
	}

	plenBuf := make([]byte, 1)
	if _, err := io.ReadFull(conn, plenBuf); err != nil {
		return fmt.Errorf("read password length: %w", err)
	}

	passwd := make([]byte, plenBuf[0])
	if _, err := io.ReadFull(conn, passwd); err != nil {
		return fmt.Errorf("read password: %w", err)
	}

	// Constant-time comparison to prevent timing attacks
	userOK := subtle.ConstantTimeCompare(uname, []byte(s.cfg.Username)) == 1
	passOK := subtle.ConstantTimeCompare(passwd, []byte(s.cfg.Password)) == 1
	ok := userOK && passOK

	status := byte(0x00)
	if !ok {
		status = 0x01
	}
	if _, err := conn.Write([]byte{authSubVersion, status}); err != nil {
		return fmt.Errorf("write auth result: %w", err)
	}
	if !ok {
		return fmt.Errorf("invalid credentials")
	}
	return nil
}

// --- Request handling (RFC 1928 section 4) ---

func (s *Server) handleRequest(conn net.Conn) error {
	// VER(1) CMD(1) RSV(1) ATYP(1)
	hdr := make([]byte, 4)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		return fmt.Errorf("read request: %w", err)
	}
	if hdr[0] != socks5Version {
		sendReply(conn, repServerFailure, nil)
		return fmt.Errorf("unsupported version %d", hdr[0])
	}

	dest, err := readAddress(conn, hdr[3])
	if err != nil {
		sendReply(conn, repAddrNotSupported, nil)
		return fmt.Errorf("read address: %w", err)
	}

	switch hdr[1] {
	case cmdConnect:
		return s.handleConnect(conn, dest)
	case cmdUDPAssociate:
		return s.handleUDPAssociate(conn)
	default:
		sendReply(conn, repCmdNotSupported, nil)
		return fmt.Errorf("unsupported command %d", hdr[1])
	}
}

// --- TCP CONNECT ---

func (s *Server) handleConnect(conn net.Conn, dest string) error {
	remote, err := net.DialTimeout("tcp", dest, dialTimeout)
	if err != nil {
		log.Tracef("SOCKS5 connect to %s failed: %v", dest, err)
		sendReply(conn, repHostUnreachable, nil)
		return err
	}
	defer remote.Close()

	if err := sendReply(conn, repSuccess, remote.LocalAddr()); err != nil {
		return fmt.Errorf("send reply: %w", err)
	}

	log.Tracef("SOCKS5 TCP relay: %s <-> %s", conn.RemoteAddr(), dest)

	// Extract client info and destination
	clientAddr := conn.RemoteAddr().String()
	clientHost, clientPortStr, _ := net.SplitHostPort(clientAddr)
	clientPort := 0
	if p, err := strconv.Atoi(clientPortStr); err == nil {
		clientPort = p
	}

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
	// Use P-TCP to indicate proxy traffic
	if !log.IsDiscoveryActive() {
		log.Infof(",P-TCP,%s,%s,%s:%d,%s,%s:%d,", sniTarget, domain, clientHost, clientPort, ipTarget, destHost, destPort)
	}

	// Also log in human-readable format
	log.Infof("[SOCKS5-TCP] Client: %s -> Destination: %s (Set: %s)", clientAddr, dest, setName)

	// Record connection in metrics for UI display
	m := getMetricsCollector()
	if m != nil {
		matched := matchedSNI || matchedIP
		m.RecordConnection("P-TCP", domain, clientAddr, dest, matched, "", setName)
	}

	// Clear handshake deadline for data relay
	conn.SetDeadline(time.Time{})

	return relay(conn, remote)
}

// relay copies data bidirectionally until one side closes.
func relay(a, b net.Conn) error {
	errc := make(chan error, 2)
	cp := func(dst, src net.Conn) {
		_, err := io.Copy(dst, src)
		// Signal the other direction to stop by closing the write half
		if tc, ok := dst.(*net.TCPConn); ok {
			tc.CloseWrite()
		}
		errc <- err
	}
	go cp(b, a)
	go cp(a, b)

	// Wait for both directions
	err1 := <-errc
	err2 := <-errc

	if err1 != nil {
		return err1
	}
	return err2
}

// --- Address parsing ---

// readAddress reads a SOCKS5 address from r (ATYP already consumed, addrType provided).
func readAddress(r io.Reader, addrType byte) (string, error) {
	switch addrType {
	case atypIPv4:
		buf := make([]byte, 4+2)
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", err
		}
		ip := net.IP(buf[:4])
		port := binary.BigEndian.Uint16(buf[4:])
		return net.JoinHostPort(ip.String(), strconv.Itoa(int(port))), nil

	case atypIPv6:
		buf := make([]byte, 16+2)
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", err
		}
		ip := net.IP(buf[:16])
		port := binary.BigEndian.Uint16(buf[16:])
		return net.JoinHostPort(ip.String(), strconv.Itoa(int(port))), nil

	case atypDomain:
		lenBuf := make([]byte, 1)
		if _, err := io.ReadFull(r, lenBuf); err != nil {
			return "", err
		}
		buf := make([]byte, int(lenBuf[0])+2)
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", err
		}
		domain := string(buf[:len(buf)-2])
		port := binary.BigEndian.Uint16(buf[len(buf)-2:])
		return net.JoinHostPort(domain, strconv.Itoa(int(port))), nil

	default:
		return "", fmt.Errorf("unsupported address type %d", addrType)
	}
}

// sendReply sends a SOCKS5 reply. If bindAddr is nil, uses 0.0.0.0:0.
func sendReply(conn net.Conn, rep byte, bindAddr net.Addr) error {
	reply := []byte{socks5Version, rep, 0x00}

	if bindAddr == nil {
		reply = append(reply, atypIPv4, 0, 0, 0, 0, 0, 0)
	} else {
		host, portStr, err := net.SplitHostPort(bindAddr.String())
		if err != nil {
			return err
		}
		port, _ := strconv.Atoi(portStr)

		ip := net.ParseIP(host)
		if ip4 := ip.To4(); ip4 != nil {
			reply = append(reply, atypIPv4)
			reply = append(reply, ip4...)
		} else {
			reply = append(reply, atypIPv6)
			reply = append(reply, ip.To16()...)
		}

		portBuf := make([]byte, 2)
		binary.BigEndian.PutUint16(portBuf, uint16(port))
		reply = append(reply, portBuf...)
	}

	_, err := conn.Write(reply)
	return err
}

// matchDestination checks if destination matches any configured sets
// Returns (matchedSNI, sniTarget, matchedIP, ipTarget)
func (s *Server) matchDestination(dest string) (bool, string, bool, string) {
	if s.fullCfg == nil || len(s.fullCfg.Sets) == 0 {
		return false, "", false, ""
	}

	// Parse destination
	host, _, err := net.SplitHostPort(dest)
	if err != nil {
		return false, "", false, ""
	}

	// Build matcher from config
	matcher := sni.NewSuffixSet(s.fullCfg.Sets)
	if matcher == nil {
		return false, "", false, ""
	}

	var matchedSNI, matchedIP bool
	var sniTarget, ipTarget string

	// Check domain/SNI match
	if host != "" {
		// Try to match as domain
		if matched, set := matcher.MatchSNI(host); matched && set != nil {
			matchedSNI = true
			sniTarget = set.Name
		}
	}

	// Check IP match
	ip := net.ParseIP(host)
	if ip != nil {
		if matched, set := matcher.MatchIP(ip); matched && set != nil {
			matchedIP = true
			ipTarget = set.Name
		}
	}

	return matchedSNI, sniTarget, matchedIP, ipTarget
}

// getMetricsCollector is a helper to safely get the metrics collector
func getMetricsCollector() *metrics.MetricsCollector {
	return metrics.GetMetricsCollector()
}
