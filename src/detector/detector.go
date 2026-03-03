package detector

import (
	"context"
	"time"

	"github.com/daniellavrushin/b4/log"
)

func (s *DetectorSuite) Run() {
	s.mu.Lock()
	s.Status = StatusRunning
	s.StartTime = time.Now()
	s.TotalChecks = s.estimateTotalChecks()
	s.mu.Unlock()

	log.DiscoveryLogf("[Detector] Starting detection suite %s with tests: %v", s.Id, s.Tests)

	ctx := context.Background()
	var stubIPs map[string]bool

	for _, test := range s.Tests {
		if s.isCanceled() {
			log.DiscoveryLogf("[Detector] Suite %s canceled", s.Id)
			s.scheduleCleanup()
			return
		}

		s.mu.Lock()
		s.CurrentTest = test
		s.mu.Unlock()

		switch test {
		case TestDNS:
			result := s.runDNSCheck(ctx)
			s.mu.Lock()
			s.DNSResult = result
			s.mu.Unlock()

			// Collect stub IPs for domain check
			if result != nil && len(result.StubIPs) > 0 {
				stubIPs = make(map[string]bool)
				for _, ip := range result.StubIPs {
					stubIPs[ip] = true
				}
			}

		case TestDomains:
			if stubIPs == nil {
				stubIPs = make(map[string]bool)
			}
			result := s.runDomainsCheck(ctx, stubIPs)
			s.mu.Lock()
			s.DomainsResult = result
			s.mu.Unlock()

		case TestTCP:
			result := s.runTCPCheck(ctx)
			s.mu.Lock()
			s.TCPResult = result
			s.mu.Unlock()
		}
	}

	s.mu.Lock()
	s.Status = StatusComplete
	s.EndTime = time.Now()
	s.CurrentTest = ""
	s.mu.Unlock()

	log.DiscoveryLogf("[Detector] Detection suite %s complete in %v", s.Id, s.EndTime.Sub(s.StartTime).Round(time.Second))

	s.scheduleCleanup()
}

func (s *DetectorSuite) scheduleCleanup() {
	go func() {
		time.Sleep(30 * time.Second)
		suitesMu.Lock()
		delete(activeSuites, s.Id)
		suitesMu.Unlock()
	}()
}

func (s *DetectorSuite) estimateTotalChecks() int {
	total := 0
	for _, test := range s.Tests {
		switch test {
		case TestDNS:
			total += len(DNSCheckDomains)
		case TestDomains:
			total += len(CheckDomains) * 3 // TLS1.3 + TLS1.2 + HTTP
		case TestTCP:
			total += len(TCPTargets)
		}
	}
	return total
}
