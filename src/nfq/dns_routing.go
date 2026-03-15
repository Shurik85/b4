package nfq

import (
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/daniellavrushin/b4/config"
)

// RoutingHandleDNSFunc is called when DNS-resolved IPs are available for routing.
// Set from main.go to break the tables ↔ nfq import cycle.
var RoutingHandleDNSFunc func(cfg *config.Config, set *config.SetConfig, ips []net.IP)

type pendingDNSRoute struct {
	setID   string
	expires time.Time
}

var (
	dnsRoutePending   sync.Map
	dnsRouteCleanMu   sync.Mutex
	dnsRouteCleanStop chan struct{}
)

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

func startDNSRouteCleanup() {
	dnsRouteCleanMu.Lock()
	defer dnsRouteCleanMu.Unlock()
	if dnsRouteCleanStop != nil {
		return
	}
	stopCh := make(chan struct{})
	dnsRouteCleanStop = stopCh
	go func(ch <-chan struct{}) {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				cleanupDNSPendingRoutes(time.Now())
			case <-ch:
				return
			}
		}
	}(stopCh)
}

func stopDNSRouteCleanup() {
	dnsRouteCleanMu.Lock()
	defer dnsRouteCleanMu.Unlock()
	if dnsRouteCleanStop == nil {
		return
	}
	close(dnsRouteCleanStop)
	dnsRouteCleanStop = nil
}

func storeDNSPendingRoute(key string, setID string) {
	startDNSRouteCleanup()
	dnsRoutePending.Store(key, pendingDNSRoute{setID: setID, expires: time.Now().Add(2 * time.Minute)})
}

func consumeDNSPendingRoute(key string) (string, bool) {
	v, ok := dnsRoutePending.LoadAndDelete(key)
	if !ok {
		return "", false
	}
	r, ok2 := v.(pendingDNSRoute)
	if !ok2 {
		return "", false
	}
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
