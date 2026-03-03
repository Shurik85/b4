package detector

import (
	"strings"
)

// ClassifyTLSError classifies a TLS connection error into a DomainStatus.
func ClassifyTLSError(err error) (DomainStatus, string) {
	if err == nil {
		return DomainOk, ""
	}

	msg := strings.ToLower(err.Error())

	// Priority 1: DPI manipulation signatures
	dpiPatterns := []struct {
		pattern string
		detail  string
	}{
		{"unexpected eof", "TLS unexpected EOF (DPI interference)"},
		{"eof occurred in violation", "TLS EOF violation (DPI interference)"},
		{"eof", "TLS connection terminated (DPI EOF injection)"},
		{"connection reset", "TCP RST injected (DPI reset)"},
		{"connection refused", "Connection refused"},
		{"bad record mac", "TLS record MAC corrupted (DPI tampering)"},
		{"decryption failed", "TLS decryption failed (DPI tampering)"},
		{"illegal parameter", "TLS illegal parameter (DPI injection)"},
		{"decode error", "TLS decode error (DPI injection)"},
		{"record overflow", "TLS record overflow (DPI injection)"},
		{"record layer failure", "TLS record layer failure (DPI injection)"},
		{"unrecognized name", "Blocked by SNI filtering"},
		{"handshake failure", "TLS handshake failed (DPI disruption)"},
		{"close notify", "TLS close notify (DPI alert injection)"},
		{"wrong version number", "Non-TLS response received (DPI replacement)"},
		{"protocol version", "TLS version blocked"},
	}

	for _, p := range dpiPatterns {
		if strings.Contains(msg, p.pattern) {
			return DomainTLSDPI, p.detail
		}
	}

	// Priority 2: MITM signatures
	mitmPatterns := []struct {
		pattern string
		detail  string
	}{
		{"no shared cipher", "No shared cipher suite (possible MITM)"},
		{"cipher", "Cipher mismatch (possible MITM)"},
		{"self-signed", "Self-signed certificate (possible MITM)"},
		{"self signed", "Self-signed certificate (possible MITM)"},
		{"hostname mismatch", "Hostname mismatch in certificate (possible MITM)"},
		{"name mismatch", "Certificate name mismatch (possible MITM)"},
		{"certificate signed by unknown authority", "Unknown CA (possible MITM)"},
		{"certificate has expired", "Expired certificate (possible MITM)"},
		{"certificate is not valid", "Invalid certificate (possible MITM)"},
		{"x509", "Certificate error (possible MITM)"},
	}

	for _, p := range mitmPatterns {
		if strings.Contains(msg, p.pattern) {
			return DomainTLSMITM, p.detail
		}
	}

	// Timeouts
	if strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline exceeded") {
		return DomainTimeout, "Connection timed out"
	}

	if strings.Contains(msg, "no such host") || strings.Contains(msg, "no address") {
		return DomainError, "DNS resolution failed"
	}

	if strings.Contains(msg, "internal error") {
		return DomainError, "TLS internal error"
	}

	return DomainError, err.Error()
}

// ClassifyHTTPResponse classifies HTTP response headers and body for ISP block pages.
func ClassifyHTTPResponse(statusCode int, location string, body string) (DomainStatus, string) {
	if statusCode == 451 {
		return DomainISPPage, "HTTP 451 Unavailable For Legal Reasons"
	}

	// Check redirect location for block markers
	locLower := strings.ToLower(location)
	for _, marker := range BlockMarkers {
		if strings.Contains(locLower, marker) {
			return DomainISPPage, "Redirect to ISP block page: " + location
		}
	}

	// Check body for block markers
	bodyLower := strings.ToLower(body)
	for _, marker := range BodyBlockMarkers {
		if strings.Contains(bodyLower, marker) {
			return DomainISPPage, "ISP block page detected in response body"
		}
	}

	return DomainOk, ""
}

