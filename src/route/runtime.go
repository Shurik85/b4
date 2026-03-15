package route

import (
	"bytes"
	"fmt"
	"hash/fnv"
	"net"
	"os/exec"
	"sort"
	"strings"
	"sync"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
)

const (
	routeTableName      = "b4_route"
	routePreroutingName = "prerouting"
	routeOutputName     = "output"
	routePostName       = "postrouting"
	hostRouteCTMark     = uint32(0x40000000)
)

type ruleState struct {
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

var (
	mu        sync.Mutex
	ruleCache = make(map[string]ruleState) // key: set id
	ifaceAuto = make(map[string]ruleState) // key: egress interface, mark+table only
)

func HandleDNSResolved(cfg *config.Config, set *config.SetConfig, ips []net.IP) {
	if cfg == nil || set == nil || !set.Routing.Enabled || len(ips) == 0 {
		return
	}
	if set.Routing.EgressInterface == "" {
		return
	}

	if !hasBinary("nft") || !hasBinary("ip") {
		log.Tracef("Routing: nft/ip binaries are missing, skipping route integration")
		return
	}

	mu.Lock()
	defer mu.Unlock()

	if err := ensureBase(); err != nil {
		log.Errorf("Routing: failed to ensure nft base table: %v", err)
		return
	}

	sources := normalizedSources(set.Routing.SourceInterfaces)
	sourcesKey := strings.Join(sources, ",")
	setV4, setV6 := buildSetNames(set.Id)
	chainPre, chainOut, chainSNAT := buildSetChainNames(set.Id)
	mark, table := resolveRouteIDs(cfg, set)

	cur := ruleState{
		mark:       mark,
		table:      table,
		iface:      set.Routing.EgressInterface,
		sourcesKey: sourcesKey,
		setV4:      setV4,
		setV6:      setV6,
		chainPre:   chainPre,
		chainOut:   chainOut,
		chainSNAT:  chainSNAT,
	}

	if old, ok := ruleCache[set.Id]; ok {
		if old.mark != cur.mark || old.table != cur.table || old.iface != cur.iface || old.sourcesKey != cur.sourcesKey {
			cleanupRule(old)
			delete(ruleCache, set.Id)
		}
	}

	if _, ok := ruleCache[set.Id]; !ok {
		if err := ensureRule(cfg, set, cur, sources); err != nil {
			log.Errorf("Routing: failed to ensure rule for set '%s': %v", set.Name, err)
			return
		}
		ruleCache[set.Id] = cur
		log.Infof("Routing: enabled set '%s' -> iface=%s mark=0x%x table=%d", set.Name, set.Routing.EgressInterface, mark, table)
	}

	ttl := set.Routing.IPTTLSeconds
	if ttl <= 0 {
		ttl = 3600
	}

	for _, ip := range ips {
		if ip4 := ip.To4(); ip4 != nil {
			runLogged("routing: add v4 element "+ip4.String(), "nft", "add", "element", "inet", routeTableName, cur.setV4, "{", ip4.String(), "timeout", fmt.Sprintf("%ds", ttl), "}")
			continue
		}
		ip6 := ip.To16()
		if ip6 != nil {
			runLogged("routing: add v6 element "+ip6.String(), "nft", "add", "element", "inet", routeTableName, cur.setV6, "{", ip6.String(), "timeout", fmt.Sprintf("%ds", ttl), "}")
		}
	}
}

func ClearAll() {
	mu.Lock()
	defer mu.Unlock()

	for _, st := range ruleCache {
		cleanupRule(st)
	}
	ruleCache = make(map[string]ruleState)
	ifaceAuto = make(map[string]ruleState)

	if hasBinary("nft") {
		runLogged("routing: flush route table", "nft", "flush", "table", "inet", routeTableName)
		runLogged("routing: delete route table", "nft", "delete", "table", "inet", routeTableName)
	}
}

func SyncConfig(cfg *config.Config) {
	if cfg == nil {
		return
	}

	mu.Lock()
	defer mu.Unlock()

	if !hasBinary("nft") || !hasBinary("ip") {
		log.Tracef("Routing: nft/ip binaries are missing, skipping runtime sync")
		ruleCache = make(map[string]ruleState)
		ifaceAuto = make(map[string]ruleState)
		return
	}

	if err := ensureBase(); err != nil {
		log.Errorf("Routing: failed to ensure nft base table during sync: %v", err)
		return
	}

	desired := make(map[string]*config.SetConfig, len(cfg.Sets))
	for _, set := range cfg.Sets {
		if set == nil || !set.Enabled || !set.Routing.Enabled || set.Routing.EgressInterface == "" {
			continue
		}
		desired[set.Id] = set
	}

	for setID, st := range ruleCache {
		if _, ok := desired[setID]; !ok {
			cleanupRule(st)
			delete(ruleCache, setID)
		}
	}

	for _, set := range cfg.Sets {
		if set == nil {
			continue
		}
		if _, ok := desired[set.Id]; !ok {
			continue
		}

		sources := normalizedSources(set.Routing.SourceInterfaces)
		sourcesKey := strings.Join(sources, ",")
		setV4, setV6 := buildSetNames(set.Id)
		chainPre, chainOut, chainSNAT := buildSetChainNames(set.Id)
		mark, table := resolveRouteIDs(cfg, set)

		cur := ruleState{
			mark:       mark,
			table:      table,
			iface:      set.Routing.EgressInterface,
			sourcesKey: sourcesKey,
			setV4:      setV4,
			setV6:      setV6,
			chainPre:   chainPre,
			chainOut:   chainOut,
			chainSNAT:  chainSNAT,
		}

		if old, ok := ruleCache[set.Id]; ok {
			if old.mark != cur.mark || old.table != cur.table || old.iface != cur.iface || old.sourcesKey != cur.sourcesKey {
				cleanupRule(old)
				delete(ruleCache, set.Id)
			}
		}

		if _, ok := ruleCache[set.Id]; !ok {
			if err := ensureRule(cfg, set, cur, sources); err != nil {
				log.Errorf("Routing: failed to ensure rule for set '%s' during sync: %v", set.Name, err)
				continue
			}
			ruleCache[set.Id] = cur
		}
	}

	ifaceAuto = make(map[string]ruleState)
	for _, st := range ruleCache {
		if _, ok := ifaceAuto[st.iface]; !ok {
			ifaceAuto[st.iface] = ruleState{mark: st.mark, table: st.table}
		}
	}
}

func ensureBase() error {
	if err := runEnsure("nft", "add", "table", "inet", routeTableName); err != nil {
		return fmt.Errorf("ensure table: %w", err)
	}
	if err := runEnsure("nft", "add", "chain", "inet", routeTableName, routePreroutingName,
		"{", "type", "filter", "hook", "prerouting", "priority", "-151", ";", "policy", "accept", ";", "}"); err != nil {
		return fmt.Errorf("ensure prerouting chain: %w", err)
	}
	if err := runEnsure("nft", "add", "chain", "inet", routeTableName, routeOutputName,
		"{", "type", "route", "hook", "output", "priority", "-151", ";", "policy", "accept", ";", "}"); err != nil {
		return fmt.Errorf("ensure output chain: %w", err)
	}
	if err := runEnsure("nft", "add", "chain", "inet", routeTableName, routePostName,
		"{", "type", "nat", "hook", "postrouting", "priority", "100", ";", "policy", "accept", ";", "}"); err != nil {
		return fmt.Errorf("ensure postrouting chain: %w", err)
	}
	return nil
}

func ensureRule(cfg *config.Config, set *config.SetConfig, st ruleState, sources []string) error {
	if cfg.Queue.IPv4Enabled {
		if err := ensureSet(st.setV4, "ipv4_addr"); err != nil {
			return err
		}
	}
	if cfg.Queue.IPv6Enabled {
		if err := ensureSet(st.setV6, "ipv6_addr"); err != nil {
			return err
		}
	}

	if err := ensureSetChain(st.chainPre); err != nil {
		return err
	}
	if err := ensureSetChain(st.chainOut); err != nil {
		return err
	}
	if err := ensureSetChain(st.chainSNAT); err != nil {
		return err
	}

	runLogged("routing: flush set prerouting chain", "nft", "flush", "chain", "inet", routeTableName, st.chainPre)
	runLogged("routing: flush set output chain", "nft", "flush", "chain", "inet", routeTableName, st.chainOut)
	runLogged("routing: flush set postrouting chain", "nft", "flush", "chain", "inet", routeTableName, st.chainSNAT)

	queueMark := queueBypassMark(cfg)
	addBypassRule(st.chainPre, queueMark)
	addBypassRule(st.chainOut, queueMark)
	addBypassRule(st.chainPre, st.mark)
	addBypassRule(st.chainOut, st.mark)

	if cfg.Queue.IPv4Enabled {
		addMarkRules(st.chainPre, false, st.setV4, st.mark, sources, false)
		addMarkRules(st.chainOut, false, st.setV4, st.mark, nil, true)
	}
	if cfg.Queue.IPv6Enabled {
		addMarkRules(st.chainPre, true, st.setV6, st.mark, sources, false)
		addMarkRules(st.chainOut, true, st.setV6, st.mark, nil, true)
	}

	ensureJumpRule(routePreroutingName, st.chainPre)
	ensureJumpRule(routeOutputName, st.chainOut)
	ensureJumpRule(routePostName, st.chainSNAT)

	addSNATRules(set.Routing.EgressInterface, st.chainSNAT, st.mark, cfg.Queue.IPv4Enabled, cfg.Queue.IPv6Enabled)

	ensurePolicyRouting(set.Routing.EgressInterface, st.mark, st.table, cfg.Queue.IPv4Enabled, cfg.Queue.IPv6Enabled)
	return nil
}

func resolveRouteIDs(cfg *config.Config, set *config.SetConfig) (uint32, int) {
	if set.Routing.FWMark > 0 && set.Routing.Table > 0 {
		return set.Routing.FWMark, set.Routing.Table
	}

	if st, ok := ifaceAuto[set.Routing.EgressInterface]; ok && st.mark > 0 && st.table > 0 {
		return st.mark, st.table
	}

	usedMarks := map[uint32]struct{}{}
	usedTables := map[int]struct{}{}

	if cfg != nil {
		usedMarks[queueBypassMark(cfg)] = struct{}{}
	}
	for _, st := range ruleCache {
		if st.mark > 0 {
			usedMarks[st.mark] = struct{}{}
		}
		if st.table > 0 {
			usedTables[st.table] = struct{}{}
		}
	}
	for _, st := range ifaceAuto {
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
		table := 100 + int((base+attempt)%2000)       // 100..2099
		mark := uint32(0x100 + (base+attempt)%0x7E00) // 0x100..0x7EFF

		if _, ok := usedMarks[mark]; ok {
			continue
		}
		if _, ok := usedTables[table]; ok {
			continue
		}

		ifaceAuto[set.Routing.EgressInterface] = ruleState{mark: mark, table: table}
		return mark, table
	}

	mark := uint32(0x66)
	table := 100
	for {
		_, markUsed := usedMarks[mark]
		_, tableUsed := usedTables[table]
		if !markUsed && !tableUsed {
			break
		}
		mark++
		table++
	}
	ifaceAuto[set.Routing.EgressInterface] = ruleState{mark: mark, table: table}
	return mark, table
}

func ensureSet(name, typ string) error {
	if err := runEnsure("nft", "add", "set", "inet", routeTableName, name,
		"{", "type", typ, ";", "flags", "timeout", ";", "timeout", "1h", ";", "}"); err != nil {
		return fmt.Errorf("ensure set %s: %w", name, err)
	}
	return nil
}

func ensureSetChain(name string) error {
	if err := runEnsure("nft", "add", "chain", "inet", routeTableName, name); err != nil {
		return fmt.Errorf("ensure chain %s: %w", name, err)
	}
	return nil
}

func addBypassRule(chain string, queueMark uint32) {
	runLogged("routing: add bypass rule "+chain, "nft", "add", "rule", "inet", routeTableName, chain,
		"meta", "mark", fmt.Sprintf("0x%x", queueMark), "return")
}

func addMarkRules(chain string, ipv6 bool, setName string, mark uint32, sources []string, tagHostConntrack bool) {
	if len(sources) == 0 {
		addSingleMarkRule(chain, ipv6, setName, mark, "", tagHostConntrack)
		return
	}
	for _, sourceIface := range sources {
		addSingleMarkRule(chain, ipv6, setName, mark, sourceIface, tagHostConntrack)
	}
}

func addSingleMarkRule(chain string, ipv6 bool, setName string, mark uint32, sourceIface string, tagHostConntrack bool) {
	args := []string{"add", "rule", "inet", routeTableName, chain}
	if sourceIface != "" {
		args = append(args, "iifname", sourceIface)
	}
	if ipv6 {
		args = append(args, "ip6", "daddr", "@"+setName, "meta", "mark", "set", fmt.Sprintf("0x%x", mark))
	} else {
		args = append(args, "ip", "daddr", "@"+setName, "meta", "mark", "set", fmt.Sprintf("0x%x", mark))
	}
	if tagHostConntrack {
		args = append(args, "ct", "mark", "set", "ct", "mark", "|", fmt.Sprintf("0x%x", hostRouteCTMark))
	}
	cmd := append([]string{"nft"}, args...)
	runLogged("routing: add mark rule "+chain, cmd...)
}

func ensureJumpRule(baseChain, jumpChain string) {
	deleteJumpRuleLoop(baseChain, jumpChain)
	runLogged("routing: add jump "+baseChain+"->"+jumpChain, "nft", "add", "rule", "inet", routeTableName, baseChain, "jump", jumpChain)
}

func deleteJumpRuleLoop(baseChain, jumpChain string) {
	for {
		_, err := run("nft", "delete", "rule", "inet", routeTableName, baseChain, "jump", jumpChain)
		if err != nil {
			return
		}
	}
}

func ensurePolicyRouting(iface string, mark uint32, table int, ipv4, ipv6 bool) {
	prio := 10000 + table
	markStr := fmt.Sprintf("0x%x", mark)
	tableStr := fmt.Sprintf("%d", table)
	prioStr := fmt.Sprintf("%d", prio)
	ifaceV4 := getIfaceAddr(iface, false)
	ifaceV6 := getIfaceAddr(iface, true)

	if ipv4 {
		delRuleLoop(false, markStr, tableStr)
		runLogged("routing: add ip rule v4", "ip", "rule", "add", "fwmark", markStr, "lookup", tableStr, "priority", prioStr)
		if ifaceV4 != "" {
			runLogged("routing: add ip route v4 with src", "ip", "route", "replace", "default", "dev", iface, "src", ifaceV4, "table", tableStr)
		} else {
			runLogged("routing: add ip route v4", "ip", "route", "replace", "default", "dev", iface, "table", tableStr)
		}
	}
	if ipv6 {
		delRuleLoop(true, markStr, tableStr)
		runLogged("routing: add ip rule v6", "ip", "-6", "rule", "add", "fwmark", markStr, "lookup", tableStr, "priority", prioStr)
		if ifaceV6 != "" {
			runLogged("routing: add ip route v6 with src", "ip", "-6", "route", "replace", "default", "dev", iface, "src", ifaceV6, "table", tableStr)
		} else {
			runLogged("routing: add ip route v6", "ip", "-6", "route", "replace", "default", "dev", iface, "table", tableStr)
		}
	}
}

func getIfaceAddr(iface string, wantV6 bool) string {
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
			if ip.IsGlobalUnicast() {
				return ip.String()
			}
			if best == "" {
				best = ip.String()
			}
			continue
		}
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
	return best
}

func cleanupRule(st ruleState) {
	markStr := fmt.Sprintf("0x%x", st.mark)
	tableStr := fmt.Sprintf("%d", st.table)
	if hasBinary("ip") {
		delRuleLoop(false, markStr, tableStr)
		delRuleLoop(true, markStr, tableStr)
	}

	if hasBinary("nft") {
		deleteJumpRuleLoop(routePreroutingName, st.chainPre)
		deleteJumpRuleLoop(routeOutputName, st.chainOut)
		deleteJumpRuleLoop(routePostName, st.chainSNAT)

		runLogged("routing: flush chain "+st.chainPre, "nft", "flush", "chain", "inet", routeTableName, st.chainPre)
		runLogged("routing: delete chain "+st.chainPre, "nft", "delete", "chain", "inet", routeTableName, st.chainPre)
		runLogged("routing: flush chain "+st.chainOut, "nft", "flush", "chain", "inet", routeTableName, st.chainOut)
		runLogged("routing: delete chain "+st.chainOut, "nft", "delete", "chain", "inet", routeTableName, st.chainOut)
		runLogged("routing: flush chain "+st.chainSNAT, "nft", "flush", "chain", "inet", routeTableName, st.chainSNAT)
		runLogged("routing: delete chain "+st.chainSNAT, "nft", "delete", "chain", "inet", routeTableName, st.chainSNAT)

		runLogged("routing: flush set "+st.setV4, "nft", "flush", "set", "inet", routeTableName, st.setV4)
		runLogged("routing: flush set "+st.setV6, "nft", "flush", "set", "inet", routeTableName, st.setV6)
		runLogged("routing: delete set "+st.setV4, "nft", "delete", "set", "inet", routeTableName, st.setV4)
		runLogged("routing: delete set "+st.setV6, "nft", "delete", "set", "inet", routeTableName, st.setV6)
	}
}

func delRuleLoop(ipv6 bool, mark, table string) {
	for {
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

func normalizedSources(sources []string) []string {
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

func buildSetNames(setID string) (string, string) {
	s := sanitizeSetID(setID)
	return "b4r_" + s + "_v4", "b4r_" + s + "_v6"
}

func buildSetChainNames(setID string) (string, string, string) {
	s := sanitizeSetID(setID)
	return "b4r_" + s + "_pre", "b4r_" + s + "_out", "b4r_" + s + "_nat"
}

func addSNATRules(iface, chain string, mark uint32, ipv4, ipv6 bool) {
	markHex := fmt.Sprintf("0x%x", mark)
	ifaceV4 := getIfaceAddr(iface, false)
	ifaceV6 := getIfaceAddr(iface, true)
	hostCTMask := fmt.Sprintf("0x%x", hostRouteCTMark)

	if ipv4 && ifaceV4 != "" {
		runLogged(
			"routing: add auto-snat v4 rule",
			"nft", "add", "rule", "inet", routeTableName, chain,
			"meta", "mark", markHex,
			"ct", "mark", "&", hostCTMask, "==", hostCTMask,
			"oifname", iface,
			"ip", "saddr", "!=", ifaceV4,
			"snat", "to", ifaceV4,
		)
	}

	if ipv6 && ifaceV6 != "" {
		runLogged(
			"routing: add auto-snat v6 rule",
			"nft", "add", "rule", "inet", routeTableName, chain,
			"meta", "mark", markHex,
			"ct", "mark", "&", hostCTMask, "==", hostCTMask,
			"oifname", iface,
			"ip6", "saddr", "!=", ifaceV6,
			"snat", "to", ifaceV6,
		)
	}
}

func sanitizeSetID(setID string) string {
	s := strings.ReplaceAll(strings.ToLower(setID), "-", "")
	if len(s) > 20 {
		s = s[:20]
	}
	if s == "" {
		s = "default"
	}
	return s
}

func queueBypassMark(cfg *config.Config) uint32 {
	if cfg == nil {
		return 0x8000
	}
	if cfg.Queue.Mark == 0 {
		return 0x8000
	}
	return uint32(cfg.Queue.Mark)
}

func hasBinary(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func run(args ...string) (string, error) {
	var out bytes.Buffer
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return out.String(), err
}

func runLogged(op string, args ...string) {
	out, err := run(args...)
	if err != nil {
		msg := strings.TrimSpace(out)
		// Idempotent add/delete operations may legitimately fail when object already exists / absent.
		if strings.Contains(msg, "File exists") || strings.Contains(msg, "No such file or directory") {
			return
		}
		log.Warnf("%s failed: %v | cmd=%s | out=%s", op, err, strings.Join(args, " "), strings.TrimSpace(out))
	}
}

func runEnsure(args ...string) error {
	out, err := run(args...)
	if err == nil {
		return nil
	}
	msg := strings.TrimSpace(out)
	if strings.Contains(msg, "File exists") {
		return nil
	}
	return fmt.Errorf("%v: %s", err, msg)
}
