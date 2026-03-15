package nfq

import (
	"fmt"
	"net"
	"sync"
	"time"
)

type pendingDNSRoute struct {
	setID   string
	expires time.Time
}

var dnsRoutePending sync.Map

func dnsRouteKeyRequest(
	ipVersion byte,
	clientIP net.IP,
	clientPort uint16,
	dnsServerIP net.IP,
	dnsServerPort uint16,
	txid uint16,
	domain string,
) string {
	return fmt.Sprintf(
		"%d|%s|%d|%s|%d|%d|%s",
		ipVersion,
		clientIP.String(),
		clientPort,
		dnsServerIP.String(),
		dnsServerPort,
		txid,
		domain,
	)
}

func dnsRouteKeyResponse(
	ipVersion byte,
	clientIP net.IP,
	clientPort uint16,
	dnsServerIP net.IP,
	dnsServerPort uint16,
	txid uint16,
	domain string,
) string {
	return dnsRouteKeyRequest(ipVersion, clientIP, clientPort, dnsServerIP, dnsServerPort, txid, domain)
}

func storeDNSPendingRoute(key string, setID string) {
	dnsRoutePending.Store(key, pendingDNSRoute{setID: setID, expires: time.Now().Add(2 * time.Minute)})
}

func consumeDNSPendingRoute(key string) (string, bool) {
	v, ok := dnsRoutePending.LoadAndDelete(key)
	if !ok {
		return "", false
	}
	r := v.(pendingDNSRoute)
	if time.Now().After(r.expires) {
		return "", false
	}
	return r.setID, true
}

func cleanupDNSPendingRoutes(now time.Time) int {
	removed := 0
	dnsRoutePending.Range(func(key, value any) bool {
		r, ok := value.(pendingDNSRoute)
		if !ok {
			dnsRoutePending.Delete(key)
			removed++
			return true
		}
		if now.After(r.expires) {
			dnsRoutePending.Delete(key)
			removed++
		}
		return true
	})
	return removed
}
