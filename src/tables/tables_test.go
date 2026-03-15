package tables

import (
	"testing"

	"github.com/daniellavrushin/b4/config"
)

func TestIPTablesManager_BuildNFQSpec(t *testing.T) {
	cfg := config.NewConfig()
	manager := NewIPTablesManager(&cfg, false)

	t.Run("single thread", func(t *testing.T) {
		spec := manager.buildNFQSpec(100, 1)

		expected := []string{"-j", "NFQUEUE", "--queue-num", "100", "--queue-bypass"}
		if len(spec) != len(expected) {
			t.Fatalf("expected %d elements, got %d", len(expected), len(spec))
		}
		for i, v := range expected {
			if spec[i] != v {
				t.Errorf("spec[%d] = %q, want %q", i, spec[i], v)
			}
		}
	})

	t.Run("multiple threads", func(t *testing.T) {
		spec := manager.buildNFQSpec(100, 4)

		expected := []string{"-j", "NFQUEUE", "--queue-balance", "100:103", "--queue-bypass"}
		if len(spec) != len(expected) {
			t.Fatalf("expected %d elements, got %d", len(expected), len(spec))
		}
		for i, v := range expected {
			if spec[i] != v {
				t.Errorf("spec[%d] = %q, want %q", i, spec[i], v)
			}
		}
	})

	t.Run("queue balance range calculation", func(t *testing.T) {
		spec := manager.buildNFQSpec(537, 8)

		// Should be 537:544 (537 + 8 - 1 = 544)
		if spec[3] != "537:544" {
			t.Errorf("expected queue-balance 537:544, got %s", spec[3])
		}
	})
}

func TestNFTablesManager_BuildNFQueueAction(t *testing.T) {
	t.Run("single thread", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.Queue.StartNum = 100
		cfg.Queue.Threads = 1
		manager := NewNFTablesManager(&cfg)

		action := manager.buildNFQueueAction()
		expected := "queue num 100 bypass"
		if action != expected {
			t.Errorf("got %q, want %q", action, expected)
		}
	})

	t.Run("multiple threads", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.Queue.StartNum = 100
		cfg.Queue.Threads = 4
		manager := NewNFTablesManager(&cfg)

		action := manager.buildNFQueueAction()
		expected := "queue num 100-103 bypass"
		if action != expected {
			t.Errorf("got %q, want %q", action, expected)
		}
	})
}

func TestNewIPTablesManager(t *testing.T) {
	cfg := config.NewConfig()

	t.Run("standard", func(t *testing.T) {
		manager := NewIPTablesManager(&cfg, false)
		if manager == nil {
			t.Fatal("expected non-nil manager")
		}
		if manager.cfg != &cfg {
			t.Error("manager.cfg not set correctly")
		}
		if manager.useLegacy {
			t.Error("useLegacy should be false")
		}
	})

	t.Run("legacy", func(t *testing.T) {
		manager := NewIPTablesManager(&cfg, true)
		if manager == nil {
			t.Fatal("expected non-nil manager")
		}
		if !manager.useLegacy {
			t.Error("useLegacy should be true")
		}
	})
}

func TestIPTablesManager_BinaryNames(t *testing.T) {
	cfg := config.NewConfig()

	t.Run("standard binaries", func(t *testing.T) {
		manager := NewIPTablesManager(&cfg, false)
		if manager.iptablesBin() != backendIPTables {
			t.Errorf("expected iptables, got %s", manager.iptablesBin())
		}
		if manager.ip6tablesBin() != backendIP6Tables {
			t.Errorf("expected ip6tables, got %s", manager.ip6tablesBin())
		}
	})

	t.Run("legacy binaries", func(t *testing.T) {
		manager := NewIPTablesManager(&cfg, true)
		if manager.iptablesBin() != backendIPTablesLegacy {
			t.Errorf("expected iptables-legacy, got %s", manager.iptablesBin())
		}
		if manager.ip6tablesBin() != backendIP6TablesLegacy {
			t.Errorf("expected ip6tables-legacy, got %s", manager.ip6tablesBin())
		}
	})
}

func TestNewNFTablesManager(t *testing.T) {
	cfg := config.NewConfig()
	manager := NewNFTablesManager(&cfg)

	if manager == nil {
		t.Fatal("expected non-nil manager")
	}
	if manager.cfg != &cfg {
		t.Error("manager.cfg not set correctly")
	}
}

func TestNewMonitor(t *testing.T) {
	t.Run("default interval", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.MonitorInterval = 0 // Will use fallback

		monitor := NewMonitor(&cfg)

		if monitor == nil {
			t.Fatal("expected non-nil monitor")
		}
		if monitor.interval < 1e9 { // 1 second in nanoseconds
			t.Error("interval should be at least 1 second")
		}
	})

	t.Run("custom interval", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.MonitorInterval = 30

		monitor := NewMonitor(&cfg)

		if monitor.interval.Seconds() != 30 {
			t.Errorf("expected 30s interval, got %v", monitor.interval)
		}
	})
}

func TestManifest_Apply_Empty(t *testing.T) {
	m := Manifest{}
	err := m.Apply()
	if err != nil {
		t.Errorf("empty manifest should apply without error: %v", err)
	}
}

func TestSysctlSetting(t *testing.T) {
	// Just test struct creation - actual apply/revert requires root
	s := SysctlSetting{
		Name:    "net.test.setting",
		Desired: "1",
		Revert:  "0",
	}

	if s.Name != "net.test.setting" {
		t.Error("Name not set")
	}
	if s.Desired != "1" {
		t.Error("Desired not set")
	}
	if s.Revert != "0" {
		t.Error("Revert not set")
	}
}

func TestRule_Struct(t *testing.T) {

	r := Rule{
		IPT:   "iptables",
		Table: "mangle",
		Chain: "B4",
		Spec:  []string{"-p", "tcp", "--dport", "443"},
	}

	if r.IPT != "iptables" {
		t.Error("IPT not set")
	}
	if r.Table != "mangle" {
		t.Error("Table not set")
	}
	if r.Chain != "B4" {
		t.Error("Chain not set")
	}
	if len(r.Spec) != 4 {
		t.Error("Spec not set correctly")
	}
}

func TestChain_Struct(t *testing.T) {

	c := Chain{
		IPT:   "iptables",
		Table: "mangle",
		Name:  "B4",
	}

	if c.IPT != "iptables" {
		t.Error("IPT not set")
	}
	if c.Table != "mangle" {
		t.Error("Table not set")
	}
	if c.Name != "B4" {
		t.Error("Name not set")
	}
}

func TestAddRules_SkipSetup(t *testing.T) {
	cfg := config.NewConfig()
	cfg.System.Tables.SkipSetup = true

	err := AddRules(&cfg)
	if err != nil {
		t.Errorf("AddRules with SkipSetup should return nil: %v", err)
	}
}

func TestClearRules_SkipSetup(t *testing.T) {
	cfg := config.NewConfig()
	cfg.System.Tables.SkipSetup = true

	err := ClearRules(&cfg)
	if err != nil {
		t.Errorf("ClearRules with SkipSetup should return nil: %v", err)
	}
}

func TestMonitor_StartStop_Disabled(t *testing.T) {
	cfg := config.NewConfig()
	cfg.System.Tables.SkipSetup = true

	monitor := NewMonitor(&cfg)

	// Should not panic or block
	monitor.Start()
	monitor.Stop()
}

func TestMonitor_StartStop_IntervalZero(t *testing.T) {
	cfg := config.NewConfig()
	cfg.System.Tables.MonitorInterval = 0

	monitor := NewMonitor(&cfg)

	// interval <= 0 disables monitor
	monitor.Start()
	monitor.Stop()
}

func TestHasBinary(t *testing.T) {
	// "sh" should exist on any unix system
	if !hasBinary("sh") {
		t.Error("sh should be found")
	}

	// Non-existent binary
	if hasBinary("nonexistent_binary_xyz123") {
		t.Error("nonexistent binary should not be found")
	}
}

func TestNFTablesConstants(t *testing.T) {
	if nftTableName != "b4_mangle" {
		t.Errorf("nftTableName = %q, want b4_mangle", nftTableName)
	}
	if nftChainName != "b4_chain" {
		t.Errorf("nftChainName = %q, want b4_chain", nftChainName)
	}
}

func TestIPTablesManager_BuildManifest_NoIPTables(t *testing.T) {
	cfg := config.NewConfig()
	cfg.Queue.IPv4Enabled = false
	cfg.Queue.IPv6Enabled = false

	manager := NewIPTablesManager(&cfg, false)
	_, err := manager.buildManifest()

	if err == nil {
		t.Error("expected error when no iptables binaries enabled")
	}
}

func TestLoadSysctlSnapshot_NoFile(t *testing.T) {
	// Temporarily change path to non-existent file
	origPath := sysctlSnapPath
	sysctlSnapPath = "/tmp/nonexistent_test_snapshot.json"
	defer func() { sysctlSnapPath = origPath }()

	snap := loadSysctlSnapshot()
	if snap == nil {
		t.Error("should return empty map, not nil")
	}
	if len(snap) != 0 {
		t.Error("should return empty map for non-existent file")
	}
}

func TestDetectFirewallBackend_ConfigOverride(t *testing.T) {
	t.Run("force nftables", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = backendNFTables
		if got := detectFirewallBackend(&cfg); got != backendNFTables {
			t.Errorf("expected nftables, got %s", got)
		}
	})

	t.Run("force nft shorthand", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = "nft"
		if got := detectFirewallBackend(&cfg); got != backendNFTables {
			t.Errorf("expected nftables, got %s", got)
		}
	})

	t.Run("force iptables", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = backendIPTables
		if got := detectFirewallBackend(&cfg); got != backendIPTables {
			t.Errorf("expected iptables, got %s", got)
		}
	})

	t.Run("force iptables-legacy", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = backendIPTablesLegacy
		if got := detectFirewallBackend(&cfg); got != backendIPTablesLegacy {
			t.Errorf("expected iptables-legacy, got %s", got)
		}
	})

	t.Run("case insensitive", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = "NFTables"
		if got := detectFirewallBackend(&cfg); got != "nftables" {
			t.Errorf("expected nftables, got %s", got)
		}
	})

	t.Run("unknown value falls through to auto-detect", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = "bogus"
		// Should not return "bogus" - falls through to auto-detection
		got := detectFirewallBackend(&cfg)
		if got == "bogus" {
			t.Error("unknown engine value should not be returned as-is")
		}
	})

	t.Run("empty string means auto-detect", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = ""
		// Should not panic, should return some valid backend
		got := detectFirewallBackend(&cfg)
		if got != backendNFTables && got != backendIPTables && got != backendIPTablesLegacy {
			t.Errorf("unexpected backend: %s", got)
		}
	})
}

func TestChunkPorts(t *testing.T) {
	t.Run("small list", func(t *testing.T) {
		ports := []string{"80", "443", "8080"}
		chunks := chunkPorts(ports, 15)
		if len(chunks) != 1 {
			t.Fatalf("expected 1 chunk, got %d", len(chunks))
		}
		if len(chunks[0]) != 3 {
			t.Errorf("expected 3 ports in chunk, got %d", len(chunks[0]))
		}
	})

	t.Run("exact boundary", func(t *testing.T) {
		ports := make([]string, 15)
		for i := range ports {
			ports[i] = "80"
		}
		chunks := chunkPorts(ports, 15)
		if len(chunks) != 1 {
			t.Fatalf("expected 1 chunk, got %d", len(chunks))
		}
	})

	t.Run("split into multiple chunks", func(t *testing.T) {
		ports := make([]string, 20)
		for i := range ports {
			ports[i] = "80"
		}
		chunks := chunkPorts(ports, 15)
		if len(chunks) != 2 {
			t.Fatalf("expected 2 chunks, got %d", len(chunks))
		}
		if len(chunks[0]) != 15 {
			t.Errorf("first chunk should have 15 ports, got %d", len(chunks[0]))
		}
		if len(chunks[1]) != 5 {
			t.Errorf("second chunk should have 5 ports, got %d", len(chunks[1]))
		}
	})

	t.Run("empty list", func(t *testing.T) {
		chunks := chunkPorts([]string{}, 15)
		if len(chunks) != 1 {
			t.Fatalf("expected 1 chunk, got %d", len(chunks))
		}
		if len(chunks[0]) != 0 {
			t.Errorf("chunk should be empty, got %d", len(chunks[0]))
		}
	})
}

func TestMonitor_BackendPropagation(t *testing.T) {
	t.Run("auto-detect backend stored", func(t *testing.T) {
		cfg := config.NewConfig()
		monitor := NewMonitor(&cfg)
		// Backend should be one of the valid values
		if monitor.backend != "nftables" && monitor.backend != "iptables" && monitor.backend != backendIPTablesLegacy {
			t.Errorf("unexpected backend in monitor: %s", monitor.backend)
		}
	})

	t.Run("config engine override propagates to monitor", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = backendIPTables
		monitor := NewMonitor(&cfg)
		if monitor.backend != backendIPTables {
			t.Errorf("expected %s, got %s", backendIPTables, monitor.backend)
		}
	})

	t.Run("legacy engine override propagates to monitor", func(t *testing.T) {
		cfg := config.NewConfig()
		cfg.System.Tables.Engine = backendIPTablesLegacy
		monitor := NewMonitor(&cfg)
		if monitor.backend != backendIPTablesLegacy {
			t.Errorf("expected %s, got %s", backendIPTablesLegacy, monitor.backend)
		}
	})
}
