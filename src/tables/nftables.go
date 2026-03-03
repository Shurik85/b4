package tables

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/log"
)

const (
	nftTableName    = "b4_mangle"
	nftChainName    = "b4_chain"
	nftNatTableName = "b4_nat"
	nftNatChainName = "b4_masq"
)

type NFTablesManager struct {
	cfg             *config.Config
	ipVersionFilter string
}

func NewNFTablesManager(cfg *config.Config) *NFTablesManager {
	return &NFTablesManager{cfg: cfg}
}

func (n *NFTablesManager) runNft(args ...string) (string, error) {
	var out bytes.Buffer
	cmd := exec.Command("nft", args...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return out.String(), err
}

func (n *NFTablesManager) tableExists() bool {
	out, err := n.runNft("list", "tables")
	if err != nil {
		return false
	}
	return strings.Contains(out, nftTableName)
}

func (n *NFTablesManager) chainExists(chain string) bool {
	_, err := n.runNft("list", "chain", "inet", nftTableName, chain)
	return err == nil
}

func (n *NFTablesManager) createTable() error {
	if n.tableExists() {
		return nil
	}
	_, err := n.runNft("add", "table", "inet", nftTableName)
	if err != nil {
		return fmt.Errorf("failed to create nftables table: %w", err)
	}
	log.Tracef("Created nftables table: %s", nftTableName)
	return nil
}

func (n *NFTablesManager) createChain(chain, hook string, priority int, policy string) error {
	if n.chainExists(chain) {
		return nil
	}

	var cmd []string
	if hook != "" {
		cmd = []string{"add", "chain", "inet", nftTableName, chain,
			fmt.Sprintf("{ type filter hook %s priority %d ; policy %s ; }", hook, priority, policy)}
	} else {
		cmd = []string{"add", "chain", "inet", nftTableName, chain}
	}

	_, err := n.runNft(cmd...)
	if err != nil {
		return fmt.Errorf("failed to create chain %s: %w", chain, err)
	}
	log.Tracef("Created nftables chain: %s", chain)
	return nil
}

func (n *NFTablesManager) buildNFQueueAction() string {
	if n.cfg.Queue.Threads > 1 {
		return fmt.Sprintf("queue num %d-%d bypass", n.cfg.Queue.StartNum, n.cfg.Queue.StartNum+n.cfg.Queue.Threads-1)
	}
	return fmt.Sprintf("queue num %d bypass", n.cfg.Queue.StartNum)
}

func (n *NFTablesManager) addRule(chain string, args ...string) error {
	cmd := append([]string{"add", "rule", "inet", nftTableName, chain}, args...)
	log.Tracef("NFTABLES: adding rule to %s: %v", chain, args)
	_, err := n.runNft(cmd...)
	if err != nil {
		return fmt.Errorf("failed to add rule to %s: %w", chain, err)
	}
	return nil
}

func (n *NFTablesManager) addFilteredRule(chain string, args ...string) error {
	if n.ipVersionFilter != "" {
		args = append(strings.Fields(n.ipVersionFilter), args...)
	}
	return n.addRule(chain, args...)
}

func (n *NFTablesManager) addQueueRule(chain string, args ...string) error {
	args = append(args, strings.Fields(n.buildNFQueueAction())...)
	return n.addFilteredRule(chain, args...)
}

func (n *NFTablesManager) Apply() error {
	cfg := n.cfg
	if !hasBinary("nft") {
		return fmt.Errorf("nft binary not found")
	}

	log.Tracef("NFTABLES: adding rules")
	loadKernelModules()

	// Clear existing table to prevent rule duplication
	if n.tableExists() {
		n.Clear()
	}

	// Set IP version filter
	switch {
	case cfg.Queue.IPv4Enabled && cfg.Queue.IPv6Enabled:
		n.ipVersionFilter = ""
	case cfg.Queue.IPv4Enabled:
		n.ipVersionFilter = "meta nfproto ipv4"
	case cfg.Queue.IPv6Enabled:
		n.ipVersionFilter = "meta nfproto ipv6"
	}

	if err := n.createTable(); err != nil {
		return err
	}

	if err := n.createChain(nftChainName, "", 0, ""); err != nil {
		return err
	}

	if err := n.createChain("prerouting", "prerouting", -150, "accept"); err != nil {
		return err
	}

	if err := n.createChain("output", "output", -150, "accept"); err != nil {
		return err
	}

	markAccept := fmt.Sprintf("0x%x", cfg.Queue.Mark)

	if cfg.Queue.Devices.Enabled && len(cfg.Queue.Devices.Mac) > 0 {
		if err := n.createChain("forward", "forward", -150, "accept"); err != nil {
			return err
		}

		if cfg.Queue.Devices.WhiteIsBlack {
			for _, mac := range cfg.Queue.Devices.Mac {
				if mac = strings.ToUpper(strings.TrimSpace(mac)); mac != "" {
					if err := n.addRule("forward", "ether", "saddr", mac, "return"); err != nil {
						return err
					}
				}
			}
			if err := n.addRule("forward", "jump", nftChainName); err != nil {
				return err
			}
		} else {
			for _, mac := range cfg.Queue.Devices.Mac {
				if mac = strings.ToUpper(strings.TrimSpace(mac)); mac != "" {
					if err := n.addRule("forward", "ether", "saddr", mac, "jump", nftChainName); err != nil {
						return err
					}
				}
			}
		}
	} else {

		if err := n.createChain("postrouting", "postrouting", -150, "accept"); err != nil {
			return err
		}
		if err := n.addRule("postrouting", "jump", nftChainName); err != nil {
			return err
		}
	}

	if err := n.addRule("output", "oifname", `"lo"`, "return"); err != nil {
		return err
	}
	if err := n.addRule("output", "meta", "mark", markAccept, "accept"); err != nil {
		return err
	}
	if err := n.addRule("output", "jump", nftChainName); err != nil {
		return err
	}

	if err := n.addRule(nftChainName, "meta", "mark", markAccept, "return"); err != nil {
		return err
	}

	// Collect TCP and UDP ports
	tcpPorts := cfg.CollectTCPPorts()
	var tcpPortExpr string
	if len(tcpPorts) == 1 {
		tcpPortExpr = tcpPorts[0]
	} else {
		tcpPortExpr = "{ " + strings.Join(tcpPorts, ", ") + " }"
	}

	// Duplication rules: queue ALL TCP packets on configured ports to specific IPs (no connbytes limit).
	// Must come before the generic connbytes-limited rules.
	dupIPv4, dupIPv6 := cfg.CollectDuplicateIPs()
	queueAction := strings.Fields(n.buildNFQueueAction())
	if len(dupIPv4) > 0 && cfg.Queue.IPv4Enabled {
		var ipExpr string
		if len(dupIPv4) == 1 {
			ipExpr = dupIPv4[0]
		} else {
			ipExpr = "{ " + strings.Join(dupIPv4, ", ") + " }"
		}
		args := append([]string{"meta", "nfproto", "ipv4", "ip", "daddr", ipExpr, "tcp", "dport", tcpPortExpr, "counter"}, queueAction...)
		if err := n.addRule(nftChainName, args...); err != nil {
			return err
		}
	}
	if len(dupIPv6) > 0 && cfg.Queue.IPv6Enabled {
		var ipExpr string
		if len(dupIPv6) == 1 {
			ipExpr = dupIPv6[0]
		} else {
			ipExpr = "{ " + strings.Join(dupIPv6, ", ") + " }"
		}
		args := append([]string{"meta", "nfproto", "ipv6", "ip6", "daddr", ipExpr, "tcp", "dport", tcpPortExpr, "counter"}, queueAction...)
		if err := n.addRule(nftChainName, args...); err != nil {
			return err
		}
	}

	tcpLimit := fmt.Sprintf("%d", cfg.MainSet.TCP.ConnBytesLimit+1)
	udpLimit := fmt.Sprintf("%d", cfg.MainSet.UDP.ConnBytesLimit+1)

	if err := n.addQueueRule(nftChainName, "tcp", "dport", tcpPortExpr, "ct", "original", "packets", "<", tcpLimit, "counter"); err != nil {
		return err
	}

	if err := n.addQueueRule(nftChainName, "udp", "dport", "53", "counter"); err != nil {
		return err
	}

	if err := n.addQueueRule("prerouting", "udp", "sport", "53", "counter"); err != nil {
		return err
	}

	if err := n.addQueueRule("prerouting", "tcp", "sport", tcpPortExpr, "ct", "original", "packets", "<", tcpLimit, "counter"); err != nil {
		return err
	}

	if err := n.addQueueRule("prerouting", "tcp", "sport", tcpPortExpr, "tcp", "flags", "&", "(syn|ack)", "==", "(syn|ack)", "counter"); err != nil {
		return err
	}

	udpPorts := cfg.CollectUDPPorts()
	var udpPortExpr string
	if len(udpPorts) == 1 {
		udpPortExpr = udpPorts[0]
	} else {
		udpPortExpr = "{ " + strings.Join(udpPorts, ", ") + " }"
	}
	if err := n.addQueueRule(nftChainName, "udp", "dport", udpPortExpr, "ct", "original", "packets", "<", udpLimit, "counter"); err != nil {
		return err
	}

	setSysctlOrProc("net.netfilter.nf_conntrack_checksum", "0")
	setSysctlOrProc("net.netfilter.nf_conntrack_tcp_be_liberal", "1")

	if err := n.ApplyMasquerade(); err != nil {
		return err
	}

	if err := n.ApplyMSSClamp(); err != nil {
		return err
	}

	if log.Level(log.CurLevel.Load()) >= log.LevelTrace {
		out, _ := n.runNft("list", "table", "inet", nftTableName)
		log.Tracef("Current nftables rules:\n%s", out)
	}

	return nil
}

func (n *NFTablesManager) Clear() error {
	if !hasBinary("nft") {
		return nil
	}

	log.Tracef("NFTABLES: clearing rules")

	n.ClearMasquerade()

	if n.tableExists() {
		if _, err := n.runNft("flush", "table", "inet", nftTableName); err != nil {
			log.Errorf("Failed to flush nftables table: %v", err)
		}
		time.Sleep(30 * time.Millisecond)
		if _, err := n.runNft("delete", "table", "inet", nftTableName); err != nil {
			log.Errorf("Failed to delete nftables table: %v", err)
		}
	}

	return nil
}

func (n *NFTablesManager) natTableExists() bool {
	out, err := n.runNft("list", "tables")
	if err != nil {
		return false
	}
	return strings.Contains(out, nftNatTableName)
}

func (n *NFTablesManager) ApplyMasquerade() error {
	if !n.cfg.System.Tables.Masquerade {
		return nil
	}

	log.Tracef("NFTABLES: adding masquerade rules")

	if !n.natTableExists() {
		if _, err := n.runNft("add", "table", "ip", nftNatTableName); err != nil {
			return fmt.Errorf("failed to create nftables nat table: %w", err)
		}
	}

	chainCmd := []string{"add", "chain", "ip", nftNatTableName, nftNatChainName,
		"{ type nat hook postrouting priority srcnat ; policy accept ; }"}
	if _, err := n.runNft(chainCmd...); err != nil {
		return fmt.Errorf("failed to create nat postrouting chain: %w", err)
	}

	ruleArgs := []string{"add", "rule", "ip", nftNatTableName, nftNatChainName}
	if iface := n.cfg.System.Tables.MasqueradeInterface; iface != "" {
		ruleArgs = append(ruleArgs, "oifname", fmt.Sprintf("%q", iface))
	}
	ruleArgs = append(ruleArgs, "masquerade")

	if _, err := n.runNft(ruleArgs...); err != nil {
		return fmt.Errorf("failed to add masquerade rule: %w", err)
	}

	iface := n.cfg.System.Tables.MasqueradeInterface
	if iface == "" {
		iface = "all"
	}
	log.Infof("NFTABLES: masquerade enabled (interface: %s)", iface)
	return nil
}

func (n *NFTablesManager) ClearMasquerade() {
	if !n.natTableExists() {
		return
	}

	log.Tracef("NFTABLES: clearing masquerade rules")
	if _, err := n.runNft("flush", "table", "ip", nftNatTableName); err != nil {
		log.Errorf("Failed to flush nftables nat table: %v", err)
	}
	time.Sleep(30 * time.Millisecond)
	if _, err := n.runNft("delete", "table", "ip", nftNatTableName); err != nil {
		log.Errorf("Failed to delete nftables nat table: %v", err)
	}
}

func (n *NFTablesManager) ApplyMSSClamp() error {
	cfg := n.cfg
	global, globalSize := cfg.HasGlobalMSSClamp()
	deviceClamps := cfg.CollectDeviceMSSClamps()

	if !global && len(deviceClamps) == 0 {
		return nil
	}

	log.Infof("NFTABLES: adding MSS clamp rules")

	synMatch := []string{"tcp", "flags", "syn", "/", "syn,rst"}
	mssSet := func(size int) []string {
		return []string{"tcp", "option", "maxseg", "size", "set", fmt.Sprintf("%d", size)}
	}

	// Ensure forward chain exists if any MSS clamp rules need it
	needsForward := global || len(deviceClamps) > 0
	if needsForward && !n.chainExists("forward") {
		if err := n.createChain("forward", "forward", -150, "accept"); err != nil {
			return fmt.Errorf("failed to create forward chain for MSS clamp: %w", err)
		}
	}

	// Global MSS clamp - applies to all TCP port 443 traffic
	if global {
		// Outgoing SYN (dport 443)
		args := append([]string{"tcp", "dport", "443"}, synMatch...)
		args = append(args, mssSet(globalSize)...)
		if err := n.addFilteredRule("output", args...); err != nil {
			return fmt.Errorf("failed to add global MSS clamp output rule: %w", err)
		}

		// Forward SYN (dport 443)
		args = append([]string{"tcp", "dport", "443"}, synMatch...)
		args = append(args, mssSet(globalSize)...)
		if err := n.addFilteredRule("forward", args...); err != nil {
			return fmt.Errorf("failed to add global MSS clamp forward rule: %w", err)
		}

		// Incoming SYN-ACK (sport 443)
		args = append([]string{"tcp", "sport", "443"}, synMatch...)
		args = append(args, mssSet(globalSize)...)
		if err := n.addFilteredRule("prerouting", args...); err != nil {
			return fmt.Errorf("failed to add global MSS clamp prerouting rule: %w", err)
		}

		log.Infof("NFTABLES: global MSS clamp enabled (size: %d)", globalSize)
	}

	// Per-device MSS clamp rules (FORWARD chain with MAC matching)
	if len(deviceClamps) > 0 {
		for size, macs := range deviceClamps {
			for _, mac := range macs {
				// Outgoing SYN from device (ether saddr MAC, dport 443)
				args := append([]string{"ether", "saddr", mac, "tcp", "dport", "443"}, synMatch...)
				args = append(args, mssSet(size)...)
				if err := n.addFilteredRule("forward", args...); err != nil {
					return fmt.Errorf("failed to add per-device MSS clamp forward outgoing rule for %s: %w", mac, err)
				}

				// Incoming SYN-ACK to device (ether daddr MAC, sport 443)
				args = append([]string{"ether", "daddr", mac, "tcp", "sport", "443"}, synMatch...)
				args = append(args, mssSet(size)...)
				if err := n.addFilteredRule("forward", args...); err != nil {
					return fmt.Errorf("failed to add per-device MSS clamp forward incoming rule for %s: %w", mac, err)
				}
			}
			log.Infof("NFTABLES: per-device MSS clamp for %d devices (size: %d)", len(macs), size)
		}
	}

	return nil
}
