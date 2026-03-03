package detector

import (
	"sync"
	"time"
)

type SuiteStatus string

const (
	StatusPending  SuiteStatus = "pending"
	StatusRunning  SuiteStatus = "running"
	StatusComplete SuiteStatus = "complete"
	StatusFailed   SuiteStatus = "failed"
	StatusCanceled SuiteStatus = "canceled"
)

type TestType string

const (
	TestDNS     TestType = "dns"
	TestDomains TestType = "domains"
	TestTCP     TestType = "tcp"
	TestSNI     TestType = "sni"
)

// DNS check types

type DNSStatus string

const (
	DNSOk           DNSStatus = "OK"
	DNSSpoofing     DNSStatus = "DNS_SPOOFING"
	DNSInterception DNSStatus = "DNS_INTERCEPTION"
	DNSTimeout      DNSStatus = "TIMEOUT"
	DNSBlocked      DNSStatus = "BLOCKED"
)

type DNSDomainResult struct {
	Domain   string    `json:"domain"`
	DoHIP    string    `json:"doh_ip"`
	UDPIP    string    `json:"udp_ip"`
	Status   DNSStatus `json:"status"`
	IsStubIP bool      `json:"is_stub_ip,omitempty"`
}

type DNSResult struct {
	Status         DNSStatus         `json:"status"`
	DoHServer      string            `json:"doh_server"`
	UDPServer      string            `json:"udp_server"`
	DoHBlocked     bool              `json:"doh_blocked"`
	UDPBlocked     bool              `json:"udp_blocked"`
	StubIPs        []string          `json:"stub_ips,omitempty"`
	Domains        []DNSDomainResult `json:"domains"`
	Summary        string            `json:"summary"`
	SpoofCount     int               `json:"spoof_count"`
	InterceptCount int               `json:"intercept_count"`
	OkCount        int               `json:"ok_count"`
}

// Domain accessibility check types

type DomainStatus string

const (
	DomainOk      DomainStatus = "OK"
	DomainTLSDPI  DomainStatus = "TLS_DPI"
	DomainTLSMITM DomainStatus = "TLS_MITM"
	DomainISPPage DomainStatus = "ISP_PAGE"
	DomainBlocked DomainStatus = "BLOCKED"
	DomainDNSFake DomainStatus = "DNS_FAKE"
	DomainTimeout DomainStatus = "TIMEOUT"
	DomainError   DomainStatus = "ERROR"
)

type TLSProbeResult struct {
	Status  DomainStatus `json:"status"`
	Detail  string       `json:"detail,omitempty"`
	Latency int64        `json:"latency_ms"`
}

type HTTPProbeResult struct {
	Status     DomainStatus `json:"status"`
	Detail     string       `json:"detail,omitempty"`
	StatusCode int          `json:"status_code,omitempty"`
	RedirectTo string       `json:"redirect_to,omitempty"`
}

type DomainCheckResult struct {
	Domain   string           `json:"domain"`
	IP       string           `json:"ip"`
	TLS13    *TLSProbeResult  `json:"tls13"`
	TLS12    *TLSProbeResult  `json:"tls12"`
	HTTP     *HTTPProbeResult `json:"http"`
	IsFakeIP bool             `json:"is_fake_ip,omitempty"`
	Overall  DomainStatus     `json:"overall"`
}

type DomainsResult struct {
	Domains      []DomainCheckResult `json:"domains"`
	BlockedCount int                 `json:"blocked_count"`
	OkCount      int                 `json:"ok_count"`
	DPICount     int                 `json:"dpi_count"`
	Summary      string              `json:"summary"`
}

// TCP fat probe test types

type TCPStatus string

const (
	TCPOk       TCPStatus = "OK"
	TCPDetected TCPStatus = "DETECTED"
	TCPMixed    TCPStatus = "MIXED"
	TCPTimeout  TCPStatus = "TIMEOUT"
	TCPError    TCPStatus = "ERROR"
)

type TCPTarget struct {
	ID       string `json:"id"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	ASN      string `json:"asn"`
	Provider string `json:"provider"`
	SNI      string `json:"sni,omitempty"`
}

type TCPTargetResult struct {
	Target   TCPTarget `json:"target"`
	Status   TCPStatus `json:"status"`
	Alive    bool      `json:"alive"`
	DropAtKB int       `json:"drop_at_kb,omitempty"`
	RTT      float64   `json:"rtt_ms,omitempty"`
	Detail   string    `json:"detail,omitempty"`
}

type TCPResult struct {
	Targets       []TCPTargetResult `json:"targets"`
	DetectedCount int               `json:"detected_count"`
	OkCount       int               `json:"ok_count"`
	Summary       string            `json:"summary"`
}

// SNI whitelist brute-force test types

type SNIStatus string

const (
	SNIFound      SNIStatus = "FOUND"
	SNINotFound   SNIStatus = "NOT_FOUND"
	SNINotBlocked SNIStatus = "NOT_BLOCKED"
)

type SNIASNResult struct {
	ASN      string    `json:"asn"`
	Provider string    `json:"provider"`
	IP       string    `json:"ip"`
	FoundSNI string    `json:"found_sni,omitempty"`
	Status   SNIStatus `json:"status"`
}

type SNIResult struct {
	ASNResults  []SNIASNResult `json:"asn_results"`
	FoundCount  int            `json:"found_count"`
	TestedCount int            `json:"tested_count"`
	Summary     string         `json:"summary"`
}

// Overall detection suite

type DetectorSuite struct {
	Id        string      `json:"id"`
	Status    SuiteStatus `json:"status"`
	StartTime time.Time   `json:"start_time"`
	EndTime   time.Time   `json:"end_time,omitempty"`

	Tests           []TestType `json:"tests"`
	CurrentTest     TestType   `json:"current_test,omitempty"`
	TotalChecks     int        `json:"total_checks"`
	CompletedChecks int        `json:"completed_checks"`

	DNSResult     *DNSResult     `json:"dns_result,omitempty"`
	DomainsResult *DomainsResult `json:"domains_result,omitempty"`
	TCPResult     *TCPResult     `json:"tcp_result,omitempty"`
	SNIResult     *SNIResult     `json:"sni_result,omitempty"`

	mu     sync.RWMutex `json:"-"`
	cancel chan struct{} `json:"-"`
}
