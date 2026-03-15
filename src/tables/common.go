package tables

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
	"sync"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/http/handler"
	"github.com/daniellavrushin/b4/log"
)

const backendIPTablesLegacy = "iptables-legacy"

var modulesLoaded sync.Once

func AddRules(cfg *config.Config) error {
	if cfg.System.Tables.SkipSetup {
		return nil
	}

	handler.SetTablesRefreshFunc(func() error {
		ClearRules(cfg)
		return AddRules(cfg)
	})

	backend := detectFirewallBackend(cfg)
	log.Tracef("Detected firewall backend: %s", backend)
	metrics := handler.GetMetricsCollector()
	metrics.TablesStatus = backend

	if backend == "nftables" {
		nft := NewNFTablesManager(cfg)
		return nft.Apply()
	}

	ipt := NewIPTablesManager(cfg, backend == backendIPTablesLegacy)

	return ipt.Apply()
}

func ClearRules(cfg *config.Config) error {

	backend := detectFirewallBackend(cfg)

	if backend == "nftables" {
		nft := NewNFTablesManager(cfg)
		return nft.Clear()
	}

	ipt := NewIPTablesManager(cfg, backend == backendIPTablesLegacy)
	return ipt.Clear()
}

func run(args ...string) (string, error) {
	var out bytes.Buffer
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err != nil {
		output := strings.TrimSpace(out.String())
		cmdStr := strings.Join(args, " ")
		if output != "" {
			return output, fmt.Errorf("command [%s] failed: %w (%s)", cmdStr, err, output)
		}
		return output, fmt.Errorf("command [%s] failed: %w", cmdStr, err)
	}
	return out.String(), nil
}

func setSysctlOrProc(name, val string) {
	_, _ = run("sh", "-c", "sysctl -w "+name+"="+val+" || echo "+val+" > /proc/sys/"+strings.ReplaceAll(name, ".", "/"))
}

func getSysctlOrProc(name string) string {
	out, _ := run("sh", "-c", "sysctl -n "+name+" 2>/dev/null || cat /proc/sys/"+strings.ReplaceAll(name, ".", "/"))
	return strings.TrimSpace(out)
}

func detectFirewallBackend(cfg *config.Config) string {
	if b := cfg.System.Tables.Engine; b != "" {
		switch strings.ToLower(b) {
		case "nftables", "nft":
			return "nftables"
		case "iptables":
			return "iptables"
		case backendIPTablesLegacy:
			return backendIPTablesLegacy
		default:
			log.Warnf("Unknown tables backend %q in config, auto-detecting", b)
		}
	}

	if nftWorking() {
		return "nftables"
	}

	if hasBinary("iptables") {
		out, _ := run("iptables", "--version")
		if strings.Contains(out, "nf_tables") {
			if hasBinary(backendIPTablesLegacy) {
				log.Infof("nftables not functional, iptables is nft-variant; using %s", backendIPTablesLegacy)
				return backendIPTablesLegacy
			}
			log.Warnf("nftables not functional and %s not found; attempting iptables (nft-variant)", backendIPTablesLegacy)
		}
		return "iptables"
	}

	if hasBinary(backendIPTablesLegacy) {
		return backendIPTablesLegacy
	}

	return "iptables"
}

func nftWorking() bool {
	if !hasBinary("nft") {
		return false
	}
	_, err := run("nft", "add", "table", "inet", "_b4_test")
	if err != nil {
		log.Tracef("nftables functional test failed: %v", err)
		return false
	}
	_, _ = run("nft", "delete", "table", "inet", "_b4_test")
	return true
}

func hasBinary(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func loadKernelModules() {
	modulesLoaded.Do(func() {
		_, _ = run("sh", "-c", "modprobe -q nfnetlink 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nf_conntrack 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nf_conntrack_netlink 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q xt_connbytes 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nfnetlink_queue 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q xt_NFQUEUE 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q xt_multiport 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nf_tables 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nft_queue 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nft_ct 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nf_nat 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q nft_masq 2>/dev/null || true")
		_, _ = run("sh", "-c", "modprobe -q xt_MASQUERADE 2>/dev/null || true")
	})
}
