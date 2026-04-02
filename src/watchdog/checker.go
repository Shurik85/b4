package watchdog

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"syscall"
	"time"

	"github.com/daniellavrushin/b4/log"
	"golang.org/x/sys/unix"
)

var blockPageRedirectMarkers = []string{
	"lawfilter", "warning.rt.ru", "blocked", "access-denied",
	"eais", "zapret-info", "rkn.gov.ru", "mvd.ru",
}

var blockPageBodyMarkers = []string{
	"заблокирован", "запрещён", "запрещен", "ограничен",
	"единый реестр", "роскомнадзор", "rkn.gov.ru", "nap.gov.ru",
	"eais.rkn.gov.ru", "warning.rt.ru", "решению суда",
}

func checkDomain(domain string, mark uint, timeout time.Duration) CheckResult {
	checkURL := "https://" + domain
	if !strings.Contains(domain, "/") {
		checkURL = "https://" + domain + "/"
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	dialer := &net.Dialer{
		Timeout:   timeout / 2,
		KeepAlive: timeout,
		Control: func(_, _ string, c syscall.RawConn) error {
			var ctrlErr error
			if err := c.Control(func(fd uintptr) {
				ctrlErr = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_MARK, int(mark))
			}); err != nil {
				return err
			}
			return ctrlErr
		},
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: false,
		},
		ResponseHeaderTimeout: timeout,
		IdleConnTimeout:       timeout,
		DialContext:            dialer.DialContext,
	}

	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}

	req, err := http.NewRequestWithContext(ctx, "GET", checkURL, nil)
	if err != nil {
		return CheckResult{Error: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return CheckResult{Error: humanizeError(err.Error())}
	}
	defer resp.Body.Close()

	if resp.StatusCode == 451 {
		return CheckResult{Error: "ISP block page (HTTP 451)"}
	}

	if loc := resp.Header.Get("Location"); loc != "" {
		locLower := strings.ToLower(loc)
		for _, marker := range blockPageRedirectMarkers {
			if strings.Contains(locLower, marker) {
				return CheckResult{Error: "ISP block page (redirect to " + loc + ")"}
			}
		}
	}

	buf := make([]byte, 16*1024)
	headBuf := make([]byte, 0, 4*1024)
	var bytesRead int64
	maxRead := int64(16 * 1024)

	for bytesRead < maxRead {
		select {
		case <-ctx.Done():
			goto evaluate
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			bytesRead += int64(n)
			if len(headBuf) < 4*1024 {
				headBuf = append(headBuf, buf[:n]...)
				if len(headBuf) > 4*1024 {
					headBuf = headBuf[:4*1024]
				}
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return CheckResult{Error: fmt.Sprintf("read error after %d bytes: %v", bytesRead, readErr)}
		}
	}

evaluate:
	duration := time.Since(start)
	speed := float64(0)
	if duration.Seconds() > 0 {
		speed = float64(bytesRead) / duration.Seconds()
	}

	if blockErr := detectBlockPage(headBuf); blockErr != "" {
		return CheckResult{Error: blockErr}
	}

	if bytesRead < 1024 {
		return CheckResult{Error: fmt.Sprintf("insufficient data: %d bytes", bytesRead)}
	}

	return CheckResult{
		OK:        true,
		Speed:     speed,
		BytesRead: bytesRead,
	}
}

func detectBlockPage(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	bodyLower := strings.ToLower(string(body))
	for _, marker := range blockPageBodyMarkers {
		if strings.Contains(bodyLower, marker) {
			return "ISP block page detected in response"
		}
	}
	return ""
}

func humanizeError(raw string) string {
	lower := strings.ToLower(raw)

	patterns := []struct {
		pattern, desc string
	}{
		{"unexpected eof", "connection closed by DPI (unexpected EOF)"},
		{"eof occurred in violation", "connection closed by DPI (EOF violation)"},
		{"connection reset by peer", "connection reset by DPI"},
		{"connection refused", "connection refused (port blocked or service down)"},
		{"i/o timeout", "connection timed out (possible DPI block)"},
		{"context deadline exceeded", "connection timed out"},
		{"tls: ", "TLS handshake failed (possible DPI interference)"},
		{"certificate", "TLS certificate error"},
		{"no such host", "DNS resolution failed"},
		{"network is unreachable", "network unreachable"},
	}

	for _, p := range patterns {
		if strings.Contains(lower, p.pattern) {
			return p.desc
		}
	}

	return raw
}

func checkAllConcurrently(domains []string, mark uint, timeout time.Duration) map[string]CheckResult {
	results := make(map[string]CheckResult, len(domains))
	type result struct {
		domain string
		check  CheckResult
	}
	ch := make(chan result, len(domains))

	for _, d := range domains {
		go func(domain string) {
			r := checkDomain(domain, mark, timeout)
			ch <- result{domain: domain, check: r}
		}(d)
	}

	for range domains {
		r := <-ch
		results[r.domain] = r.check
	}

	log.Tracef("[WATCHDOG] checked %d domains concurrently", len(domains))
	return results
}
