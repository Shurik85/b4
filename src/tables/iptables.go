package tables

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
)

type IPTablesManager struct {
	cfg              *config.Config
	useLegacy        bool
	multiportSupport map[string]bool // per-binary cache (iptables vs ip6tables may differ)
}

func NewIPTablesManager(cfg *config.Config, useLegacy bool) *IPTablesManager {
	return &IPTablesManager{cfg: cfg, useLegacy: useLegacy, multiportSupport: make(map[string]bool)}
}

func (im *IPTablesManager) iptablesBin() string {
	if im.useLegacy {
		return "iptables-legacy"
	}
	return "iptables"
}

func (im *IPTablesManager) ip6tablesBin() string {
	if im.useLegacy {
		return "ip6tables-legacy"
	}
	return "ip6tables"
}

// hasMultiportSupport checks if iptables multiport module is available
func (im *IPTablesManager) hasMultiportSupport(ipt string) bool {
	if result, ok := im.multiportSupport[ipt]; ok {
		return result
	}

	// Try to add and immediately remove a test rule using multiport
	testSpec := []string{"-p", "tcp", "-m", "multiport", "--dports", "80,443", "-j", "ACCEPT"}
	_, err := run(append([]string{ipt, "-w", "-t", "filter", "-C", "INPUT"}, testSpec...)...)
	if err == nil {
		// Rule exists (unlikely), multiport works
		im.multiportSupport[ipt] = true
		return true
	}

	// Try to add the rule
	_, err = run(append([]string{ipt, "-w", "-t", "filter", "-A", "INPUT"}, testSpec...)...)
	if err == nil {
		// Success - remove it immediately
		_, _ = run(append([]string{ipt, "-w", "-t", "filter", "-D", "INPUT"}, testSpec...)...)
		im.multiportSupport[ipt] = true
		log.Tracef("IPTABLES[%s]: multiport module is available", ipt)
		return true
	}

	log.Warnf("IPTABLES[%s]: multiport module not available, using individual port rules", ipt)
	im.multiportSupport[ipt] = false
	return false
}

func (im *IPTablesManager) existsChain(ipt, table, chain string) bool {
	_, err := run(ipt, "-w", "-t", table, "-S", chain)
	return err == nil
}

func (im *IPTablesManager) ensureChain(ipt, table, chain string) {
	if !im.existsChain(ipt, table, chain) {
		_, _ = run(ipt, "-w", "-t", table, "-N", chain)
	}
}

func (im *IPTablesManager) existsRule(ipt, table, chain string, spec []string) bool {
	_, err := run(append([]string{ipt, "-w", "-t", table, "-C", chain}, spec...)...)
	return err == nil
}

func (im *IPTablesManager) delAll(ipt, table, chain string, spec []string) {
	for {
		_, err := run(append([]string{ipt, "-w", "-t", table, "-D", chain}, spec...)...)
		if err != nil {
			break
		}
	}
}

type Rule struct {
	manager *IPTablesManager
	IPT     string
	Table   string
	Chain   string
	Spec    []string
	Action  string
}

func (r Rule) Apply() error {
	if r.manager.existsRule(r.IPT, r.Table, r.Chain, r.Spec) {
		return nil
	}
	op := "-A"
	if strings.ToUpper(r.Action) == "I" {
		op = "-I"
	}
	_, err := run(append([]string{r.IPT, "-w", "-t", r.Table, op, r.Chain}, r.Spec...)...)
	if err != nil {
		return fmt.Errorf("failed to apply rule [%s %s %s %s]: %w", r.IPT, r.Table, r.Chain, strings.Join(r.Spec, " "), err)
	}
	return nil
}

func (r Rule) Remove() {
	r.manager.delAll(r.IPT, r.Table, r.Chain, r.Spec)
}

type Chain struct {
	manager *IPTablesManager
	IPT     string
	Table   string
	Name    string
}

func (c Chain) Ensure() {
	c.manager.ensureChain(c.IPT, c.Table, c.Name)
}

func (c Chain) Remove() {
	if c.manager.existsChain(c.IPT, c.Table, c.Name) {
		_, _ = run(c.IPT, "-w", "-t", c.Table, "-F", c.Name)
		_, _ = run(c.IPT, "-w", "-t", c.Table, "-X", c.Name)
	}
}

type SysctlSetting struct {
	Name    string
	Desired string
	Revert  string
}

var sysctlSnapPath = "/tmp/b4_sysctl_snapshot.json"

func loadSysctlSnapshot() map[string]string {
	b, err := os.ReadFile(sysctlSnapPath)
	if err != nil {
		return map[string]string{}
	}
	var m map[string]string
	if json.Unmarshal(b, &m) != nil {
		return map[string]string{}
	}
	return m
}

func saveSysctlSnapshot(m map[string]string) {
	b, _ := json.Marshal(m)
	_ = os.WriteFile(sysctlSnapPath, b, 0600)
}

func (ipt *IPTablesManager) buildNFQSpec(queueStart, threads int) []string {
	if threads > 1 {
		start := strconv.Itoa(queueStart)
		end := strconv.Itoa(queueStart + threads - 1)
		return []string{"-j", "NFQUEUE", "--queue-balance", start + ":" + end, "--queue-bypass"}
	}
	return []string{"-j", "NFQUEUE", "--queue-num", strconv.Itoa(queueStart), "--queue-bypass"}
}

func (s SysctlSetting) Apply() {
	snap := loadSysctlSnapshot()
	if _, ok := snap[s.Name]; !ok {
		snap[s.Name] = getSysctlOrProc(s.Name)
		saveSysctlSnapshot(snap)
	}
	setSysctlOrProc(s.Name, s.Desired)
}

func (s SysctlSetting) RevertBack() {
	snap := loadSysctlSnapshot()
	if v, ok := snap[s.Name]; ok && v != "" {
		setSysctlOrProc(s.Name, v)
		delete(snap, s.Name)
		saveSysctlSnapshot(snap)
		return
	}
	setSysctlOrProc(s.Name, s.Revert)
}

type Manifest struct {
	Chains  []Chain
	Rules   []Rule
	Sysctls []SysctlSetting
}

func (m Manifest) Apply() error {
	for _, c := range m.Chains {
		c.Ensure()
	}
	for _, r := range m.Rules {
		if err := r.Apply(); err != nil {
			return err
		}
	}
	for _, s := range m.Sysctls {
		s.Apply()
	}
	return nil
}

func (m Manifest) RemoveRules() {
	for i := len(m.Rules) - 1; i >= 0; i-- {
		m.Rules[i].Remove()
	}
}

func (m Manifest) RemoveChains() {
	for i := len(m.Chains) - 1; i >= 0; i-- {
		m.Chains[i].Remove()
	}
}

func (m Manifest) RevertSysctls() {
	for _, s := range m.Sysctls {
		s.RevertBack()
	}
}

func (manager *IPTablesManager) buildManifest() (Manifest, error) {
	cfg := manager.cfg
	var ipts []string
	iptBin := manager.iptablesBin()
	ip6tBin := manager.ip6tablesBin()
	if cfg.Queue.IPv4Enabled && hasBinary(iptBin) {
		ipts = append(ipts, iptBin)
	}
	if cfg.Queue.IPv6Enabled && hasBinary(ip6tBin) {
		ipts = append(ipts, ip6tBin)
	}
	if len(ipts) == 0 {
		return Manifest{}, errors.New("no valid iptables binaries found")
	}
	queueNum := cfg.Queue.StartNum
	threads := cfg.Queue.Threads
	chainName := "B4"
	markAccept := fmt.Sprintf("0x%x/0x%x", cfg.Queue.Mark, cfg.Queue.Mark)
	if cfg.Queue.Mark == 0 {
		markAccept = "0x8000/0x8000"
	}

	var chains []Chain
	var rules []Rule

	for _, ipt := range ipts {
		ch := Chain{manager: manager, IPT: ipt, Table: "mangle", Name: chainName}
		chains = append(chains, ch)

		tcpConnbytesRange := fmt.Sprintf("0:%d", cfg.Queue.TCPConnBytesLimit)
		udpConnbytesRange := fmt.Sprintf("0:%d", cfg.Queue.UDPConnBytesLimit)

		dnsSpec := append(
			[]string{"-p", "udp", "--dport", "53"},
			manager.buildNFQSpec(queueNum, threads)...,
		)

		dnsResponseSpec := append(
			[]string{"-p", "udp", "--sport", "53"},
			manager.buildNFQSpec(queueNum, threads)...,
		)

		// Collect and normalize TCP ports (default: 443)
		tcpPorts := cfg.CollectTCPPorts()
		for i, p := range tcpPorts {
			tcpPorts[i] = strings.ReplaceAll(p, "-", ":")
		}

		// TCP response and SYN-ACK rules (PREROUTING)
		if manager.hasMultiportSupport(ipt) {
			tcpPortChunks := chunkPorts(tcpPorts, 15)
			for _, chunk := range tcpPortChunks {
				portList := strings.Join(chunk, ",")
				tcpResponseSpec := append(
					[]string{"-p", "tcp", "-m", "multiport", "--sports", portList,
						"-m", "connbytes", "--connbytes-dir", "reply",
						"--connbytes-mode", "packets", "--connbytes", tcpConnbytesRange},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				synackSpec := append(
					[]string{"-p", "tcp", "-m", "multiport", "--sports", portList,
						"--tcp-flags", "SYN,ACK", "SYN,ACK"},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules,
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: tcpResponseSpec},
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: synackSpec},
				)
			}
		} else {
			for _, port := range tcpPorts {
				tcpResponseSpec := append(
					[]string{"-p", "tcp", "--sport", port,
						"-m", "connbytes", "--connbytes-dir", "reply",
						"--connbytes-mode", "packets", "--connbytes", tcpConnbytesRange},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				synackSpec := append(
					[]string{"-p", "tcp", "--sport", port, "--tcp-flags", "SYN,ACK", "SYN,ACK"},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules,
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: tcpResponseSpec},
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: synackSpec},
				)
			}
		}

		rules = append(rules,
			Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: dnsResponseSpec},
		)

		// Duplication rules: queue ALL TCP packets on configured ports to specific IPs (no connbytes limit).
		// Must come before the generic connbytes-limited TCP rule.
		dupIPv4, dupIPv6 := cfg.CollectDuplicateIPs()
		var dupIPs []string
		if strings.HasPrefix(ipt, "iptables") {
			dupIPs = dupIPv4
		} else {
			dupIPs = dupIPv6
		}
		for _, cidr := range dupIPs {
			if manager.hasMultiportSupport(ipt) {
				for _, chunk := range chunkPorts(tcpPorts, 15) {
					dupSpec := append(
						[]string{"-p", "tcp", "-d", cidr, "-m", "multiport", "--dports", strings.Join(chunk, ",")},
						manager.buildNFQSpec(queueNum, threads)...,
					)
					rules = append(rules,
						Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: dupSpec},
					)
				}
			} else {
				for _, port := range tcpPorts {
					dupSpec := append(
						[]string{"-p", "tcp", "-d", cidr, "--dport", port},
						manager.buildNFQSpec(queueNum, threads)...,
					)
					rules = append(rules,
						Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: dupSpec},
					)
				}
			}
		}

		// TCP outbound rules (B4 chain)
		if manager.hasMultiportSupport(ipt) {
			for _, chunk := range chunkPorts(tcpPorts, 15) {
				tcpSpec := append(
					[]string{"-p", "tcp", "-m", "multiport", "--dports", strings.Join(chunk, ","),
						"-m", "connbytes", "--connbytes-dir", "original",
						"--connbytes-mode", "packets", "--connbytes", tcpConnbytesRange},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules, Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: tcpSpec})
			}
		} else {
			for _, port := range tcpPorts {
				tcpSpec := append(
					[]string{"-p", "tcp", "--dport", port,
						"-m", "connbytes", "--connbytes-dir", "original",
						"--connbytes-mode", "packets", "--connbytes", tcpConnbytesRange},
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules, Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: tcpSpec})
			}
		}

		rules = append(rules,
			Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: dnsSpec},
		)

		udpPorts := cfg.CollectUDPPorts()
		for i, p := range udpPorts {
			udpPorts[i] = strings.ReplaceAll(p, "-", ":")
		}

		if manager.hasMultiportSupport(ipt) {
			// Use multiport for efficiency (batches up to 15 ports per rule)
			udpPortChunks := chunkPorts(udpPorts, 15)
			for _, chunk := range udpPortChunks {
				udpPortSpec := []string{"-p", "udp", "-m", "multiport", "--dports", strings.Join(chunk, ",")}
				udpSpec := append(
					append(udpPortSpec,
						"-m", "connbytes", "--connbytes-dir", "original",
						"--connbytes-mode", "packets", "--connbytes", udpConnbytesRange),
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules, Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: udpSpec})
			}
		} else {
			// Fallback: create individual rules for each port/range
			for _, port := range udpPorts {
				udpPortSpec := []string{"-p", "udp", "--dport", port}
				udpSpec := append(
					append(udpPortSpec,
						"-m", "connbytes", "--connbytes-dir", "original",
						"--connbytes-mode", "packets", "--connbytes", udpConnbytesRange),
					manager.buildNFQSpec(queueNum, threads)...,
				)
				rules = append(rules, Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: chainName, Action: "A", Spec: udpSpec})
			}
		}

		if cfg.Queue.Devices.Enabled && len(cfg.Queue.Devices.Mac) > 0 {
			if cfg.Queue.Devices.WhiteIsBlack {
				rules = append(rules,
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
						Spec: []string{"-j", chainName}},
				)
				for _, mac := range cfg.Queue.Devices.Mac {
					mac = strings.ToUpper(strings.TrimSpace(mac))
					if mac == "" {
						continue
					}
					rules = append(rules,
						Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
							Spec: []string{"-m", "mac", "--mac-source", mac, "-j", "RETURN"}},
					)
				}
			} else {
				for _, mac := range cfg.Queue.Devices.Mac {
					mac = strings.ToUpper(strings.TrimSpace(mac))
					if mac == "" {
						continue
					}
					rules = append(rules,
						Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
							Spec: []string{"-m", "mac", "--mac-source", mac, "-j", chainName}},
					)
				}
			}
		} else {
			rules = append(rules,
				Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "POSTROUTING", Action: "I",
					Spec: []string{"-j", chainName}},
			)
		}

		rules = append(rules,
			Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I", Spec: dnsResponseSpec},
			Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "OUTPUT", Action: "I",
				Spec: []string{"-m", "mark", "--mark", markAccept, "-j", "ACCEPT"}},
			Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "OUTPUT", Action: "A",
				Spec: []string{"-j", chainName}},
		)
	}

	if cfg.System.Tables.Masquerade {
		for _, ipt := range ipts {
			masqSpec := []string{"-j", "MASQUERADE"}
			if iface := cfg.System.Tables.MasqueradeInterface; iface != "" {
				masqSpec = []string{"-o", iface, "-j", "MASQUERADE"}
			}
			rules = append(rules,
				Rule{manager: manager, IPT: ipt, Table: "nat", Chain: "POSTROUTING", Action: "A", Spec: masqSpec},
			)
		}
	}

	// MSS Clamp rules
	global, globalSize := cfg.HasGlobalMSSClamp()
	deviceClamps := cfg.CollectDeviceMSSClamps()
	if global || len(deviceClamps) > 0 {
		log.Infof("IPTABLES: adding MSS clamp rules")

		for _, ipt := range ipts {
			// Global MSS clamp - all TCP port 443
			if global {
				tcpMSSSpec := fmt.Sprintf("%d", globalSize)
				rules = append(rules,
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "OUTPUT", Action: "I",
						Spec: []string{"-p", "tcp", "--dport", "443", "--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--set-mss", tcpMSSSpec}},
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
						Spec: []string{"-p", "tcp", "--dport", "443", "--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--set-mss", tcpMSSSpec}},
					Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "PREROUTING", Action: "I",
						Spec: []string{"-p", "tcp", "--sport", "443", "--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--set-mss", tcpMSSSpec}},
				)
				log.Infof("IPTABLES[%s]: global MSS clamp enabled (size: %d)", ipt, globalSize)
			}

			// Per-device MSS clamp rules (FORWARD chain with MAC matching)
			if len(deviceClamps) > 0 {
				minSize := 1460
				for size, macs := range deviceClamps {
					if size < minSize {
						minSize = size
					}
					tcpMSSSpec := fmt.Sprintf("%d", size)
					for _, mac := range macs {
						// Outgoing SYN from device (mac-source match, dport 443)
						rules = append(rules,
							Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
								Spec: []string{"-m", "mac", "--mac-source", mac, "-p", "tcp", "--dport", "443",
									"--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--set-mss", tcpMSSSpec}},
						)
					}
					log.Infof("IPTABLES[%s]: per-device MSS clamp for %d devices (size: %d)", ipt, len(macs), size)
				}

				// iptables cannot match destination MAC. Add a broad FORWARD rule
				// for incoming SYN-ACK using the smallest per-device size.
				if !global {
					rules = append(rules,
						Rule{manager: manager, IPT: ipt, Table: "mangle", Chain: "FORWARD", Action: "I",
							Spec: []string{"-p", "tcp", "--sport", "443",
								"--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--set-mss", fmt.Sprintf("%d", minSize)}},
					)
				}
			}
		}
	}

	sysctls := []SysctlSetting{
		{Name: "net.netfilter.nf_conntrack_checksum", Desired: "0", Revert: "1"},
		{Name: "net.netfilter.nf_conntrack_tcp_be_liberal", Desired: "1", Revert: "0"},
	}

	return Manifest{Chains: chains, Rules: rules, Sysctls: sysctls}, nil
}

func (ipt *IPTablesManager) Apply() error {
	log.Infof("IPTABLES: adding rules")
	loadKernelModules()
	m, err := ipt.buildManifest()
	if err != nil {
		return err
	}
	result := m.Apply()

	if log.Level(log.CurLevel.Load()) >= log.LevelTrace {
		iptablesTrace, _ := run("sh", "-c", "cat /proc/net/netfilter/nfnetlink_queue && "+ipt.iptablesBin()+" -t mangle -vnL --line-numbers")
		log.Tracef("Current iptables mangle table:\n%s", iptablesTrace)
	}
	return result
}

func (ipt *IPTablesManager) Clear() error {
	m, err := ipt.buildManifest()
	if err != nil {
		return err
	}

	ipt.clearB4JumpRules()

	m.RemoveRules()
	time.Sleep(30 * time.Millisecond)
	m.RemoveChains()
	return nil
}

func (ipt *IPTablesManager) clearB4JumpRules() {
	ipts := []string{}
	iptBin := ipt.iptablesBin()
	ip6tBin := ipt.ip6tablesBin()
	if ipt.cfg.Queue.IPv4Enabled && hasBinary(iptBin) {
		ipts = append(ipts, iptBin)
	}
	if ipt.cfg.Queue.IPv6Enabled && hasBinary(ip6tBin) {
		ipts = append(ipts, ip6tBin)
	}

	for _, iptBin := range ipts {
		// Clean POSTROUTING
		for {
			_, err := run(iptBin, "-w", "-t", "mangle", "-D", "POSTROUTING", "-j", "B4")
			if err != nil {
				break
			}
		}

		// Clean FORWARD
		for {
			out, _ := run(iptBin, "-w", "-t", "mangle", "-S", "FORWARD")
			if !strings.Contains(out, "B4") && !strings.Contains(out, "--mac-source") {
				break
			}

			_, err1 := run(iptBin, "-w", "-t", "mangle", "-D", "FORWARD", "-j", "B4")

			lines := strings.Split(out, "\n")
			removedAny := false
			for _, line := range lines {
				if strings.Contains(line, "--mac-source") {
					parts := strings.Fields(line)
					for i, p := range parts {
						if p == "--mac-source" && i+1 < len(parts) {
							mac := strings.ToUpper(parts[i+1])
							if _, err := run(iptBin, "-w", "-t", "mangle", "-D", "FORWARD",
								"-m", "mac", "--mac-source", mac, "-j", "RETURN"); err == nil {
								removedAny = true
							}
							if _, err := run(iptBin, "-w", "-t", "mangle", "-D", "FORWARD",
								"-m", "mac", "--mac-source", mac, "-j", "B4"); err == nil {
								removedAny = true
							}
							break
						}
					}
				}
			}

			if err1 != nil && !removedAny {
				break
			}
		}

		// Clean PREROUTING - parse and remove any NFQUEUE rules for DNS and TCP
		for {
			out, _ := run(iptBin, "-w", "-t", "mangle", "--line-numbers", "-nL", "PREROUTING")
			lines := strings.Split(out, "\n")
			removed := false
			for _, line := range lines {
				isDNS := strings.Contains(line, "spt:53") && strings.Contains(line, "NFQUEUE")
				isTCP := strings.Contains(line, "tcp") && strings.Contains(line, "NFQUEUE")
				if isDNS || isTCP {
					parts := strings.Fields(line)
					if len(parts) > 0 {
						lineNum := parts[0]
						if _, err := run(iptBin, "-w", "-t", "mangle", "-D", "PREROUTING", lineNum); err == nil {
							removed = true
							break // Re-parse after deletion since line numbers shift
						}
					}
				}
			}
			if !removed {
				break
			}
		}

		// Clean OUTPUT - parse and remove any B4 mark rules
		for {
			out, _ := run(iptBin, "-w", "-t", "mangle", "-S", "OUTPUT")
			if !strings.Contains(out, "ACCEPT") || !strings.Contains(out, "mark") {
				break
			}

			removed := false
			lines := strings.Split(out, "\n")
			for _, line := range lines {
				if strings.Contains(line, "-j ACCEPT") && strings.Contains(line, "--mark") {
					parts := strings.Fields(line)
					for i, p := range parts {
						if p == "--mark" && i+1 < len(parts) {
							mark := parts[i+1]
							_, err := run(iptBin, "-w", "-t", "mangle", "-D", "OUTPUT",
								"-m", "mark", "--mark", mark, "-j", "ACCEPT")
							if err == nil {
								removed = true
							}
							break
						}
					}
					if removed {
						break
					}
				}
			}
			if !removed {
				break
			}
		}

		for {
			_, err := run(iptBin, "-w", "-t", "mangle", "-D", "OUTPUT", "-j", "B4")
			if err != nil {
				break
			}
		}

		// Clean nat POSTROUTING masquerade rules
		for {
			_, err := run(iptBin, "-w", "-t", "nat", "-D", "POSTROUTING", "-j", "MASQUERADE")
			if err != nil {
				break
			}
		}
		if iface := ipt.cfg.System.Tables.MasqueradeInterface; iface != "" {
			for {
				_, err := run(iptBin, "-w", "-t", "nat", "-D", "POSTROUTING", "-o", iface, "-j", "MASQUERADE")
				if err != nil {
					break
				}
			}
		}

		// Clean MSS clamp rules (TCPMSS target) from OUTPUT, FORWARD, PREROUTING
		for _, chain := range []string{"OUTPUT", "FORWARD", "PREROUTING"} {
			for {
				out, _ := run(iptBin, "-w", "-t", "mangle", "-S", chain)
				if !strings.Contains(out, "TCPMSS") {
					break
				}
				removed := false
				lines := strings.Split(out, "\n")
				for _, line := range lines {
					if !strings.Contains(line, "TCPMSS") || !strings.Contains(line, "--set-mss") {
						continue
					}
					// Parse the rule spec from "-A CHAIN ..." format
					parts := strings.Fields(line)
					if len(parts) < 3 {
						continue
					}
					// Remove "-A CHAIN" prefix to get the spec
					spec := parts[2:]
					if _, err := run(append([]string{iptBin, "-w", "-t", "mangle", "-D", chain}, spec...)...); err == nil {
						removed = true
						break
					}
				}
				if !removed {
					break
				}
			}
		}
	}
}

func chunkPorts(ports []string, maxSize int) [][]string {
	if len(ports) <= maxSize {
		return [][]string{ports}
	}
	var chunks [][]string
	for i := 0; i < len(ports); i += maxSize {
		end := i + maxSize
		if end > len(ports) {
			end = len(ports)
		}
		chunks = append(chunks, ports[i:end])
	}
	return chunks
}
