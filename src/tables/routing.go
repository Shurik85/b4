package tables

import (
	"context"
	"fmt"
	"hash/fnv"
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
)

const hostRouteCTMark = uint32(0x40000000)

type routeState struct {
	mark       uint32
	table      int
	iface      string
	sourcesKey string
	setV4      string
	setV6      string
	chainPre   string
	chainOut   string
	chainSNAT  string
}

// routeBackend abstracts firewall operations so routing works on both nftables and iptables.
type routeBackend interface {
	name() string
	available() bool
	ensureBase() error
	ensureIPSet(name string, v6 bool) error
	addElement(setName, ip string, ttlSec int)
	ensureChain(chain string, isMangle bool) error
	flushChain(chain string, isMangle bool)
	deleteChain(chain string, isMangle bool)
	addBypassRule(chain string, mark uint32)
	addMarkRule(chain string, v6 bool, setName string, mark uint32, sourceIface string, tagHostConntrack bool)
	ensureJumpRule(baseChain, targetChain string, isMangle bool)
	deleteJumpRules(baseChain, targetChain string, isMangle bool)
	addMasqueradeRule(chain string, mark uint32, iface string, v6 bool)
	flushIPSet(name string)
	destroyIPSet(name string)
	clearAll()
}

var (
	routeMu        sync.Mutex
	routeRuleCache = make(map[string]routeState)
	routeIfaceAuto = make(map[string]routeState)
	routeEngine    routeBackend
)

func getRouteBackend(cfg *config.Config) routeBackend {
	if routeEngine != nil {
		return routeEngine
	}
	be := detectFirewallBackend(cfg)
	nft := &routeNftBackend{}
	ipt := &routeIptBackend{legacy: be == backendIPTablesLegacy}
	switch be {
	case backendNFTables:
		if nft.available() {
			routeEngine = nft
		}
	default: // "iptables", "iptables-legacy"
		if ipt.available() {
			routeEngine = ipt
		}
	}
	if routeEngine == nil && nft.available() {
		routeEngine = nft
	} else if routeEngine == nil && ipt.available() {
		routeEngine = ipt
	}
	return routeEngine
}

// RoutingHandleDNS is called from the nfq DNS handler when resolved IPs are available.
func RoutingHandleDNS(cfg *config.Config, set *config.SetConfig, ips []net.IP) {
	if cfg == nil || set == nil || !set.Routing.Enabled || len(ips) == 0 {
		return
	}
	if set.Routing.EgressInterface == "" {
		return
	}
	if !hasBinary("ip") {
		log.Tracef("Routing: ip binary is missing, skipping")
		return
	}

	routeMu.Lock()
	defer routeMu.Unlock()

	be := getRouteBackend(cfg)
	if be == nil {
		log.Tracef("Routing: no firewall backend available (need nft or iptables+ipset)")
		return
	}

	if err := be.ensureBase(); err != nil {
		log.Errorf("Routing: failed to ensure base (%s): %v", be.name(), err)
		return
	}

	sources := routeNormalizedSources(set.Routing.SourceInterfaces)
	sourcesKey := strings.Join(sources, ",")
	setV4, setV6 := routeBuildSetNames(set.Id)
	chainPre, chainOut, chainSNAT := routeBuildChainNames(set.Id)
	mark, table := routeResolveIDs(cfg, set)

	cur := routeState{
		mark: mark, table: table,
		iface: set.Routing.EgressInterface, sourcesKey: sourcesKey,
		setV4: setV4, setV6: setV6,
		chainPre: chainPre, chainOut: chainOut, chainSNAT: chainSNAT,
	}

	if old, ok := routeRuleCache[set.Id]; ok {
		if old.mark != cur.mark || old.table != cur.table || old.iface != cur.iface || old.sourcesKey != cur.sourcesKey {
			routeCleanupRule(be, old)
			delete(routeRuleCache, set.Id)
		}
	}

	if _, ok := routeRuleCache[set.Id]; !ok {
		if err := routeEnsureRule(be, cfg, set, cur, sources); err != nil {
			log.Errorf("Routing: failed to ensure rule for set '%s': %v", set.Name, err)
			return
		}
		routeRuleCache[set.Id] = cur
		log.Infof("Routing [%s]: enabled set '%s' -> iface=%s mark=0x%x table=%d", be.name(), set.Name, set.Routing.EgressInterface, mark, table)
	}

	ttl := set.Routing.IPTTLSeconds
	if ttl <= 0 {
		ttl = 3600
	}

	for _, ip := range ips {
		if ip4 := ip.To4(); ip4 != nil {
			be.addElement(cur.setV4, ip4.String(), ttl)
			continue
		}
		if ip6 := ip.To16(); ip6 != nil {
			be.addElement(cur.setV6, ip6.String(), ttl)
		}
	}
}

func RoutingClearAll() {
	routeMu.Lock()
	defer routeMu.Unlock()

	be := routeEngine
	if be == nil {
		nft := &routeNftBackend{}
		if nft.available() {
			nft.clearAll()
		}
		// Try both iptables and iptables-legacy for best-effort cleanup.
		for _, legacy := range []bool{false, true} {
			ipt := &routeIptBackend{legacy: legacy}
			if hasBinary(ipt.ipt4()) || hasBinary(ipt.ipt6()) {
				ipt.clearAll()
			}
		}
	} else {
		for _, st := range routeRuleCache {
			routeCleanupRule(be, st)
		}
		be.clearAll()
	}
	routeRuleCache = make(map[string]routeState)
	routeIfaceAuto = make(map[string]routeState)
	routeEngine = nil
}

func RoutingSyncConfig(cfg *config.Config) {
	if cfg == nil {
		return
	}

	routeMu.Lock()
	defer routeMu.Unlock()

	be := getRouteBackend(cfg)
	if be == nil {
		log.Tracef("Routing: no firewall backend available, skipping sync")
		routeRuleCache = make(map[string]routeState)
		routeIfaceAuto = make(map[string]routeState)
		return
	}

	if !hasBinary("ip") {
		log.Tracef("Routing: ip binary is missing, skipping sync")
		routeRuleCache = make(map[string]routeState)
		routeIfaceAuto = make(map[string]routeState)
		return
	}

	if err := be.ensureBase(); err != nil {
		log.Errorf("Routing: failed to ensure base during sync (%s): %v", be.name(), err)
		return
	}

	desired := make(map[string]*config.SetConfig, len(cfg.Sets))
	for _, set := range cfg.Sets {
		if set == nil || !set.Enabled || !set.Routing.Enabled || set.Routing.EgressInterface == "" {
			continue
		}
		desired[set.Id] = set
	}

	for setID, st := range routeRuleCache {
		if _, ok := desired[setID]; !ok {
			routeCleanupRule(be, st)
			delete(routeRuleCache, setID)
		}
	}

	var newRoutingSets []*config.SetConfig
	for _, set := range cfg.Sets {
		if set == nil {
			continue
		}
		if _, ok := desired[set.Id]; !ok {
			continue
		}

		sources := routeNormalizedSources(set.Routing.SourceInterfaces)
		sourcesKey := strings.Join(sources, ",")
		setV4, setV6 := routeBuildSetNames(set.Id)
		chainPre, chainOut, chainSNAT := routeBuildChainNames(set.Id)
		mark, table := routeResolveIDs(cfg, set)

		cur := routeState{
			mark: mark, table: table,
			iface: set.Routing.EgressInterface, sourcesKey: sourcesKey,
			setV4: setV4, setV6: setV6,
			chainPre: chainPre, chainOut: chainOut, chainSNAT: chainSNAT,
		}

		if old, ok := routeRuleCache[set.Id]; ok {
			if old.mark != cur.mark || old.table != cur.table || old.iface != cur.iface || old.sourcesKey != cur.sourcesKey {
				routeCleanupRule(be, old)
				delete(routeRuleCache, set.Id)
			}
		}

		if _, ok := routeRuleCache[set.Id]; !ok {
			if err := routeEnsureRule(be, cfg, set, cur, sources); err != nil {
				log.Errorf("Routing: failed to ensure rule for set '%s' during sync: %v", set.Name, err)
				continue
			}
			routeRuleCache[set.Id] = cur
			newRoutingSets = append(newRoutingSets, set)
		}
	}

	routeIfaceAuto = make(map[string]routeState)
	for _, st := range routeRuleCache {
		if _, ok := routeIfaceAuto[st.iface]; !ok {
			routeIfaceAuto[st.iface] = routeState{mark: st.mark, table: st.table}
		}
	}

	if len(newRoutingSets) > 0 {
		cfgSnapshot := *cfg
		go routePreResolveDomains(&cfgSnapshot, newRoutingSets)
	}
}

func routePreResolveDomains(cfg *config.Config, sets []*config.SetConfig) {
	for _, set := range sets {
		for _, domain := range set.Targets.SNIDomains {
			domain = strings.TrimSpace(domain)
			if domain == "" {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, domain)
			cancel()
			if err != nil {
				log.Tracef("Routing: pre-resolve %s failed: %v", domain, err)
				continue
			}
			resolved := make([]net.IP, 0, len(ips))
			for _, ip := range ips {
				if ip.IP.To4() != nil && !cfg.Queue.IPv4Enabled {
					continue
				}
				if ip.IP.To4() == nil && !cfg.Queue.IPv6Enabled {
					continue
				}
				resolved = append(resolved, ip.IP)
			}
			if len(resolved) > 0 {
				RoutingHandleDNS(cfg, set, resolved)
				log.Tracef("Routing: pre-resolved %s -> %d IPs", domain, len(resolved))
			}
		}
	}
}

// --- internal orchestration ---

func routeEnsureRule(be routeBackend, cfg *config.Config, set *config.SetConfig, st routeState, sources []string) error {
	if cfg.Queue.IPv4Enabled {
		if err := be.ensureIPSet(st.setV4, false); err != nil {
			return err
		}
	}
	if cfg.Queue.IPv6Enabled {
		if err := be.ensureIPSet(st.setV6, true); err != nil {
			return err
		}
	}

	if err := be.ensureChain(st.chainPre, true); err != nil {
		return err
	}
	if err := be.ensureChain(st.chainOut, true); err != nil {
		return err
	}
	if err := be.ensureChain(st.chainSNAT, false); err != nil {
		return err
	}

	be.flushChain(st.chainPre, true)
	be.flushChain(st.chainOut, true)
	be.flushChain(st.chainSNAT, false)

	queueMark := routeQueueBypassMark(cfg)
	be.addBypassRule(st.chainPre, queueMark)
	be.addBypassRule(st.chainOut, queueMark)
	be.addBypassRule(st.chainPre, st.mark)
	be.addBypassRule(st.chainOut, st.mark)

	if cfg.Queue.IPv4Enabled {
		routeAddMarkRules(be, st.chainPre, false, st.setV4, st.mark, sources, false)
		routeAddMarkRules(be, st.chainOut, false, st.setV4, st.mark, nil, true)
	}
	if cfg.Queue.IPv6Enabled {
		routeAddMarkRules(be, st.chainPre, true, st.setV6, st.mark, sources, false)
		routeAddMarkRules(be, st.chainOut, true, st.setV6, st.mark, nil, true)
	}

	be.ensureJumpRule("PREROUTING", st.chainPre, true)
	be.ensureJumpRule("OUTPUT", st.chainOut, true)
	be.ensureJumpRule("POSTROUTING", st.chainSNAT, false)

	routeAddMasqueradeRules(be, set.Routing.EgressInterface, st.chainSNAT, st.mark, cfg.Queue.IPv4Enabled, cfg.Queue.IPv6Enabled)
	routeEnsurePolicyRouting(set.Routing.EgressInterface, st.mark, st.table, cfg.Queue.IPv4Enabled, cfg.Queue.IPv6Enabled)
	return nil
}

func routeAddMarkRules(be routeBackend, chain string, v6 bool, setName string, mark uint32, sources []string, tagHostCT bool) {
	if len(sources) == 0 {
		be.addMarkRule(chain, v6, setName, mark, "", tagHostCT)
		return
	}
	for _, src := range sources {
		be.addMarkRule(chain, v6, setName, mark, src, tagHostCT)
	}
}

func routeAddMasqueradeRules(be routeBackend, iface, chain string, mark uint32, ipv4, ipv6 bool) {
	if ipv4 {
		be.addMasqueradeRule(chain, mark, iface, false)
	}
	if ipv6 {
		be.addMasqueradeRule(chain, mark, iface, true)
	}
}

func routeCleanupRule(be routeBackend, st routeState) {
	markStr := fmt.Sprintf("0x%x", st.mark)
	tableStr := fmt.Sprintf("%d", st.table)
	if hasBinary("ip") {
		routeDelRuleLoop(false, markStr, tableStr)
		routeDelRuleLoop(true, markStr, tableStr)
		runLogged("routing: flush route table v4", "ip", "route", "flush", "table", tableStr)
		runLogged("routing: flush route table v6", "ip", "-6", "route", "flush", "table", tableStr)
	}

	be.deleteJumpRules("PREROUTING", st.chainPre, true)
	be.deleteJumpRules("OUTPUT", st.chainOut, true)
	be.deleteJumpRules("POSTROUTING", st.chainSNAT, false)

	be.flushChain(st.chainPre, true)
	be.deleteChain(st.chainPre, true)
	be.flushChain(st.chainOut, true)
	be.deleteChain(st.chainOut, true)
	be.flushChain(st.chainSNAT, false)
	be.deleteChain(st.chainSNAT, false)

	be.flushIPSet(st.setV4)
	be.destroyIPSet(st.setV4)
	be.flushIPSet(st.setV6)
	be.destroyIPSet(st.setV6)
}

// --- helpers ---

func routeEnsurePolicyRouting(iface string, mark uint32, table int, ipv4, ipv6 bool) {
	prio := 10000 + table
	markStr := fmt.Sprintf("0x%x", mark)
	tableStr := fmt.Sprintf("%d", table)
	prioStr := fmt.Sprintf("%d", prio)
	ifaceV4 := routeGetIfaceAddr(iface, false)
	ifaceV6 := routeGetIfaceAddr(iface, true)

	if ipv4 {
		routeDelRuleLoop(false, markStr, tableStr)
		runLogged("routing: add ip rule v4", "ip", "rule", "add", "fwmark", markStr, "lookup", tableStr, "priority", prioStr)
		routeReplaceDefaultRoute(iface, ifaceV4, tableStr, false)
	}
	if ipv6 {
		routeDelRuleLoop(true, markStr, tableStr)
		runLogged("routing: add ip rule v6", "ip", "-6", "rule", "add", "fwmark", markStr, "lookup", tableStr, "priority", prioStr)
		routeReplaceDefaultRoute(iface, ifaceV6, tableStr, true)
	}
}

func routeReplaceDefaultRoute(iface, src, table string, ipv6 bool) {
	family := "v4"
	ipCmd := []string{"ip"}
	if ipv6 {
		family = "v6"
		ipCmd = append(ipCmd, "-6")
	}

	if gw := routeDefaultGatewayForIface(iface, ipv6); gw != "" {
		args := append([]string{}, ipCmd...)
		args = append(args, "route", "replace", "default", "via", gw, "dev", iface)
		if src != "" {
			args = append(args, "src", src)
		}
		args = append(args, "table", table)
		runLogged("routing: add ip route "+family+" (via gw)", args...)
		return
	}

	args := append([]string{}, ipCmd...)
	args = append(args, "route", "replace", "default", "dev", iface)
	if src != "" {
		args = append(args, "src", src)
	}
	args = append(args, "table", table)
	runLogged("routing: add ip route "+family+" (direct)", args...)
}

func routeDefaultGatewayForIface(iface string, ipv6 bool) string {
	args := []string{"ip"}
	if ipv6 {
		args = append(args, "-6")
	} else {
		args = append(args, "-4")
	}
	args = append(args, "route", "show", "default", "dev", iface)
	out, err := run(args...)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		for i := 0; i+1 < len(fields); i++ {
			if fields[i] == "via" {
				return fields[i+1]
			}
		}
	}
	return ""
}

func routeGetIfaceAddr(iface string, wantV6 bool) string {
	ifaceObj, err := net.InterfaceByName(iface)
	if err != nil {
		return ""
	}
	addrs, err := ifaceObj.Addrs()
	if err != nil {
		return ""
	}
	best := ""
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok || ipNet.IP == nil {
			continue
		}
		ip := ipNet.IP
		if wantV6 {
			if ip.To4() != nil {
				continue
			}

			if !ip.IsGlobalUnicast() {
				continue
			}
			return ip.String()
		} else {
			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}
			if ip4.IsGlobalUnicast() {
				return ip4.String()
			}
			if best == "" {
				best = ip4.String()
			}
		}
	}
	return best
}

func routeResolveIDs(cfg *config.Config, set *config.SetConfig) (uint32, int) {
	if set.Routing.FWMark > 0 && set.Routing.Table > 0 {
		return set.Routing.FWMark, set.Routing.Table
	}
	if st, ok := routeIfaceAuto[set.Routing.EgressInterface]; ok && st.mark > 0 && st.table > 0 {
		return st.mark, st.table
	}

	usedMarks := map[uint32]struct{}{}
	usedTables := map[int]struct{}{}
	if cfg != nil {
		usedMarks[routeQueueBypassMark(cfg)] = struct{}{}
	}
	for _, st := range routeRuleCache {
		if st.mark > 0 {
			usedMarks[st.mark] = struct{}{}
		}
		if st.table > 0 {
			usedTables[st.table] = struct{}{}
		}
	}
	for _, st := range routeIfaceAuto {
		if st.mark > 0 {
			usedMarks[st.mark] = struct{}{}
		}
		if st.table > 0 {
			usedTables[st.table] = struct{}{}
		}
	}

	h := fnv.New32a()
	_, _ = h.Write([]byte(set.Routing.EgressInterface))
	base := h.Sum32()

	for attempt := uint32(0); attempt < 4096; attempt++ {
		table := 100 + int((base+attempt)%2000)
		mark := uint32(0x100 + (base+attempt)%0x7E00)
		if _, ok := usedMarks[mark]; ok {
			continue
		}
		if _, ok := usedTables[table]; ok {
			continue
		}
		routeIfaceAuto[set.Routing.EgressInterface] = routeState{mark: mark, table: table}
		return mark, table
	}

	mark := uint32(0x66)
	table := 100
	for i := 0; i < 4096; i++ {
		_, markUsed := usedMarks[mark]
		_, tableUsed := usedTables[table]
		if !markUsed && !tableUsed {
			break
		}
		mark++
		table++
	}
	routeIfaceAuto[set.Routing.EgressInterface] = routeState{mark: mark, table: table}
	return mark, table
}

func routeDelRuleLoop(ipv6 bool, mark, table string) {
	for i := 0; i < 100; i++ {
		var err error
		if ipv6 {
			_, err = run("ip", "-6", "rule", "del", "fwmark", mark, "lookup", table)
		} else {
			_, err = run("ip", "rule", "del", "fwmark", mark, "lookup", table)
		}
		if err != nil {
			return
		}
	}
}

func routeNormalizedSources(sources []string) []string {
	if len(sources) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	out := make([]string, 0, len(sources))
	for _, s := range sources {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

func routeBuildSetNames(setID string) (string, string) {
	s := routeSanitizeSetID(setID)
	return "b4r_" + s + "_v4", "b4r_" + s + "_v6"
}

func routeBuildChainNames(setID string) (string, string, string) {
	s := routeSanitizeSetID(setID)
	return "b4r_" + s + "_pre", "b4r_" + s + "_out", "b4r_" + s + "_nat"
}

func routeSanitizeSetID(setID string) string {
	var b strings.Builder
	for _, c := range strings.ToLower(setID) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
			b.WriteRune(c)
		}
	}
	s := b.String()
	if s == "" {
		s = "default"
	}

	h := fnv.New32a()
	_, _ = h.Write([]byte(setID))
	suffix := fmt.Sprintf("_%x", h.Sum32()%0xFFFF)
	maxPrefix := 20 - len(suffix)
	if len(s) > maxPrefix {
		s = s[:maxPrefix]
	}
	return s + suffix
}

func routeQueueBypassMark(cfg *config.Config) uint32 {
	if cfg == nil || cfg.Queue.Mark == 0 {
		return 0x8000
	}
	return uint32(cfg.Queue.Mark)
}
