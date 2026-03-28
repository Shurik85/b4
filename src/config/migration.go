package config

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/daniellavrushin/b4/log"
	"github.com/google/uuid"
)

type MigrationFunc func(*Config, map[string]interface{}) error

var (
	CurrentConfigVersion = len(migrationRegistry)
	MinSupportedVersion  = 0
)

var migrationRegistry = map[int]MigrationFunc{
	0:  migrateV0to1, // Add enabled field to sets
	1:  migrateV1to2,
	2:  migrateV2to3,
	3:  migrateV3to4,
	4:  migrateV4to5,
	5:  migrateV5to6,
	6:  migrateV6to7, // Add TCP syn TTL and drop SACK settings
	7:  migrateV7to8, // Add DNS redirect settings
	8:  migrateV8to9,
	9:  migrateV9to10,
	10: migrateV10to11,
	11: migrateV11to12,
	12: migrateV12to13,
	13: migrateV13to14,
	14: migrateV14to15, // Flatten TCP desync settings into nested struct
	15: migrateV15to16, // Add TCP Incoming config
	16: migrateV16to17,
	17: migrateV17to18, // Add TCP packet duplication config
	18: migrateV18to19, // Add TLS certificate/key to web server config
	19: migrateV19to20, // Add vendor lookup option to devices config
	20: migrateV20to21, // Add SOCKS5 proxy server config
	21: migrateV21to22, // Add NAT masquerade config
	22: migrateV22to23, // Add TCP MSS clamping config
	23: migrateV23to24, // Add multidisorder (fake per segment) and new payload types
	24: migrateV24to25, // Remove main set, move ConnBytesLimit to queue config
	25: migrateV25to26, // Add TLS version filter to targets
	26: migrateV26to27, // Add tables engine config
	27: migrateV27to28, // Add per-set routing config
	28: migrateV28to29, // Add position ranges and strategy pool
	29: migrateV29to30, // Add MTProto proxy config
	30: migrateV30to31, // Add discovery flow/injected marks
}

func migrateV30to31(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v30->v31: Adding discovery flow/injected marks")
	c.System.Checker.DiscoveryFlowMark = DefaultConfig.System.Checker.DiscoveryFlowMark
	c.System.Checker.DiscoveryInjectedMark = DefaultConfig.System.Checker.DiscoveryInjectedMark
	return nil
}

func migrateV29to30(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v29->v30: Adding MTProto proxy config")
	c.System.MTProto = DefaultConfig.System.MTProto
	return nil
}

func migrateV28to29(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v28->v29: Adding position ranges and strategy pool")
	for _, set := range c.Sets {
		if set.Fragmentation.StrategyPool == nil {
			set.Fragmentation.StrategyPool = []string{}
		}
	}
	return nil
}

func migrateV27to28(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v27->v28: Adding per-set routing config")
	for _, set := range c.Sets {
		if set.Routing.SourceInterfaces == nil {
			set.Routing.SourceInterfaces = []string{}
		}
		if set.Routing.IPTTLSeconds <= 0 {
			set.Routing.IPTTLSeconds = DefaultSetConfig.Routing.IPTTLSeconds
		}
	}
	return nil
}

// Migration: v26 -> v27 (add tables engine config)
func migrateV26to27(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v26->v27: Adding tables engine config")
	c.System.Timezone = DefaultConfig.System.Timezone
	c.System.Tables.Engine = DefaultConfig.System.Tables.Engine
	return nil
}

// Migration: v25 -> v26 (add TLS version filter to targets)
func migrateV25to26(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v25->v26: Adding TLS version filter to targets")
	for _, set := range c.Sets {
		set.Targets.TLSVersion = ""
	}
	return nil
}

// Migration: v24 -> v25 (remove main set, move ConnBytesLimit to queue config)
func migrateV24to25(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v24->v25: Removing main set, moving ConnBytesLimit to queue config")

	oldMainSetID := "11111111-1111-1111-1111-111111111111"

	// Move ConnBytesLimit from main set to queue config, and give it a new ID
	for _, set := range c.Sets {
		if set.Id == oldMainSetID {
			c.Queue.TCPConnBytesLimit = set.TCP.ConnBytesLimit
			c.Queue.UDPConnBytesLimit = set.UDP.ConnBytesLimit
			set.Id = uuid.New().String()
			break
		}
	}

	// Ensure defaults if main set wasn't found
	if c.Queue.TCPConnBytesLimit == 0 {
		c.Queue.TCPConnBytesLimit = DefaultConfig.Queue.TCPConnBytesLimit
	}
	if c.Queue.UDPConnBytesLimit == 0 {
		c.Queue.UDPConnBytesLimit = DefaultConfig.Queue.UDPConnBytesLimit
	}

	return nil
}

func migrateV23to24(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v23->v24: Adding multidisorder (fake per segment) to combo/disorder configs")
	for _, set := range c.Sets {
		set.Fragmentation.Combo.FakePerSegment = DefaultSetConfig.Fragmentation.Combo.FakePerSegment
		set.Fragmentation.Combo.FakePerSegCount = DefaultSetConfig.Fragmentation.Combo.FakePerSegCount
		set.Fragmentation.Disorder.FakePerSegment = DefaultSetConfig.Fragmentation.Disorder.FakePerSegment
		set.Fragmentation.Disorder.FakePerSegCount = DefaultSetConfig.Fragmentation.Disorder.FakePerSegCount
	}
	return nil
}

func migrateV22to23(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v22->v23: Adding queue-level MSS clamping config")

	c.Queue.MSSClamp = DefaultConfig.Queue.MSSClamp
	if c.Queue.Devices.MSSClamps == nil {
		c.Queue.Devices.MSSClamps = []DeviceMSSClamp{}
	}

	return nil
}

func migrateV21to22(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v21->v22: Adding NAT masquerade config")
	c.System.Tables.Masquerade = DefaultConfig.System.Tables.Masquerade
	c.System.Tables.MasqueradeInterface = DefaultConfig.System.Tables.MasqueradeInterface
	return nil
}

func migrateV20to21(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v20->v21: Adding SOCKS5 proxy server config")
	c.System.Socks5 = DefaultConfig.System.Socks5
	return nil
}

func migrateV19to20(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v19->v20: Adding vendor lookup option to devices config")
	c.Queue.Devices.VendorLookup = false
	return nil
}

func migrateV18to19(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v18->v19: Adding TLS certificate/key fields to web server config")
	// TLS fields default to empty strings (TLS disabled), no action needed
	return nil
}

func migrateV17to18(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v17->v18: Adding TCP packet duplication config")

	for _, set := range c.Sets {
		set.TCP.Duplicate = DefaultSetConfig.TCP.Duplicate
	}
	return nil
}

func migrateV16to17(c *Config, _ map[string]interface{}) error {

	for _, set := range c.Sets {
		set.Faking.TimestampDecrease = DefaultSetConfig.Faking.TimestampDecrease
	}
	return nil
}

func migrateV15to16(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v15->v16: Adding TCP Incoming config")

	for _, set := range c.Sets {
		set.TCP.Incoming = DefaultSetConfig.TCP.Incoming
	}
	return nil
}

func migrateV14to15(c *Config, raw map[string]interface{}) error {
	sets, _ := raw["sets"].([]interface{})

	for i, setRaw := range sets {
		if i >= len(c.Sets) {
			break
		}
		setMap, _ := setRaw.(map[string]interface{})
		tcpMap, _ := setMap["tcp"].(map[string]interface{})
		if tcpMap == nil {
			continue
		}

		// Extract old flat fields
		if mode, ok := tcpMap["desync_mode"].(string); ok {
			c.Sets[i].TCP.Desync.Mode = mode
		}
		if ttl, ok := tcpMap["desync_ttl"].(float64); ok {
			c.Sets[i].TCP.Desync.TTL = uint8(ttl)
		}
		if count, ok := tcpMap["desync_count"].(float64); ok {
			c.Sets[i].TCP.Desync.Count = int(count)
		}
		if post, ok := tcpMap["post_desync"].(bool); ok {
			c.Sets[i].TCP.Desync.PostDesync = post
		}

		if mode, ok := tcpMap["win_mode"].(string); ok {
			c.Sets[i].TCP.Win.Mode = mode
		}
		if values, ok := tcpMap["win_values"].([]interface{}); ok {
			c.Sets[i].TCP.Win.Values = make([]int, len(values))
			for j, v := range values {
				if f, ok := v.(float64); ok {
					c.Sets[i].TCP.Win.Values[j] = int(f)
				}
			}
		}

	}
	return nil
}

// Migration: v13 -> v14 (add fragmentation strategy field)
func migrateV13to14(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v13->v14: Adding fragmentation strategy field")

	c.System.WebServer.BindAddress = DefaultConfig.System.WebServer.BindAddress
	for _, set := range c.Sets {
		set.TCP.Desync.PostDesync = DefaultSetConfig.TCP.Desync.PostDesync
		set.Fragmentation.Combo.DecoyEnabled = DefaultSetConfig.Fragmentation.Combo.DecoyEnabled
	}
	return nil
}

// Migration: v12 -> v13 (add payload file/data to faking config)
func migrateV12to13(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v12->v13: Adding TLSMod to faking config")

	for _, set := range c.Sets {
		set.Faking.TLSMod = DefaultSetConfig.Faking.TLSMod
	}
	return nil
}

// Migration: v11 -> v12 (add TCP FilterSYN setting)
func migrateV11to12(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v11->v12: Adding TCP FilterSYN setting")

	for _, set := range c.Sets {
		set.Faking.PayloadFile = DefaultSetConfig.Faking.PayloadFile
		set.Faking.PayloadData = DefaultSetConfig.Faking.PayloadData

		set.Fragmentation.SeqOverlapPattern = DefaultSetConfig.Fragmentation.SeqOverlapPattern
		set.Fragmentation.SeqOverlapBytes = DefaultSetConfig.Fragmentation.SeqOverlapBytes
	}
	return nil
}

// Migration: v10 -> v11 (add devices config to queue)
func migrateV10to11(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v10->v11: Adding devices config to queue")

	c.Queue.Devices = DefaultConfig.Queue.Devices
	return nil
}

// Migration: v9 -> v10 (add error log file setting)
func migrateV9to10(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v9->v10: Adding error log file setting")

	c.Queue.Interfaces = []string{}
	return nil

}

// Migration: v8 -> v9
func migrateV8to9(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v8->v9: No changes, placeholder migration")
	c.System.Logging.ErrorFile = DefaultConfig.System.Logging.ErrorFile
	return nil
}

// Migration: v7 -> v8 (add DNS redirect settings)
func migrateV7to8(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v7->v8: Adding DNS redirect settings")

	for _, set := range c.Sets {
		set.DNS = DefaultSetConfig.DNS
	}
	c.System.Checker.ReferenceDNS = DefaultConfig.System.Checker.ReferenceDNS
	return nil
}

// Migration: v6 -> v7 (add TCP syn TTL and drop SACK settings)
func migrateV6to7(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v6->v7: Adding TCP syn TTL and drop SACK settings")

	for _, set := range c.Sets {
		set.TCP.SynTTL = DefaultSetConfig.TCP.SynTTL
	}
	return nil
}

// Migration: v5 -> v6 (add reference domain to discovery config)
func migrateV5to6(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v5->v6: Initializing missing fields with default values")

	for _, set := range c.Sets {
		set.Fragmentation.Combo = DefaultSetConfig.Fragmentation.Combo
		set.Fragmentation.Disorder = DefaultSetConfig.Fragmentation.Disorder
		//	set.Fragmentation.Overlap = DefaultSetConfig.Fragmentation.Overlap
	}
	return nil
}

// Migration: v4 -> v5 (add reference domain to discovery config)
func migrateV4to5(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v4->v5: Adding reference domain to discovery config")

	c.System.Checker.ReferenceDomain = "max.ru"

	return nil
}

// Migration: v0 -> v1 (add enabled field to sets)
func migrateV0to1(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v0->v1: Adding 'enabled' field to all sets")

	for _, set := range c.Sets {
		set.Enabled = true
	}

	return nil
}

func migrateV1to2(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v1->v2: Renaming sni_reverse to reverse_order")

	for _, set := range c.Sets {
		set.Fragmentation.ReverseOrder = DefaultSetConfig.Fragmentation.ReverseOrder
		set.Fragmentation.OOBChar = DefaultSetConfig.Fragmentation.OOBChar
		set.Fragmentation.OOBPosition = DefaultSetConfig.Fragmentation.OOBPosition
		set.Fragmentation.TLSRecordPosition = DefaultSetConfig.Fragmentation.TLSRecordPosition
	}

	return nil
}

func migrateV2to3(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v2->v3: Adding TCP desync/window settings and SNI mutation")

	for _, set := range c.Sets {
		// TCP desync settings
		set.TCP.Desync = DefaultSetConfig.TCP.Desync

		// TCP window manipulation
		set.TCP.Win = DefaultSetConfig.TCP.Win

		// SNI mutation
		set.Faking.SNIMutation = DefaultSetConfig.Faking.SNIMutation
	}

	return nil
}

func migrateV3to4(c *Config, _ map[string]interface{}) error {
	log.Tracef("Migration v3->v4: Initializing missing fields with default values")

	c.System.Checker.ConfigPropagateMs = DefaultConfig.System.Checker.ConfigPropagateMs
	c.System.Checker.DiscoveryTimeoutSec = DefaultConfig.System.Checker.DiscoveryTimeoutSec

	return nil
}

// discoverConfigPath checks well-known locations for a config file.
func discoverConfigPath() string {
	candidates := []string{
		"/etc/b4/b4.json",
		"/etc/b4/config.json",
		"/opt/etc/b4/b4.json",
		"/opt/etc/b4/config.json",
	}
	for _, p := range candidates {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	if info, err := os.Stat("/etc/b4"); err == nil && info.IsDir() {
		return "/etc/b4/b4.json"
	}
	if info, err := os.Stat("/opt/etc/b4"); err == nil && info.IsDir() {
		return "/opt/etc/b4/b4.json"
	}
	return "/etc/b4/b4.json"
}

func (c *Config) LoadWithMigration(path string) error {
	discovered := false
	if path == "" {
		path = discoverConfigPath()
		c.ConfigPath = path
		discovered = true
		log.Infof("Using config path: %s", path)
	}

	info, err := os.Stat(path)
	if err != nil {
		if discovered && os.IsNotExist(err) {
			log.Infof("Config file does not exist yet, using defaults: %s", path)
			return nil
		}
		return log.Errorf("failed to stat config file: %v", err)
	}
	if info.IsDir() {
		return log.Errorf("config path is a directory, not a file: %s", path)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return log.Errorf("failed to read config file: %v", err)
	}

	var rawJSON map[string]interface{}
	if err := json.Unmarshal(data, &rawJSON); err != nil {
		return log.Errorf("failed to parse config file: %v", err)
	}

	if err := json.Unmarshal(data, c); err != nil {
		return log.Errorf("failed to parse config file: %v", err)
	}

	if c.Version < CurrentConfigVersion {
		log.Infof("Config version %d is older than current version %d, migrating",
			c.Version, CurrentConfigVersion)
		if err := c.applyMigrations(c.Version, rawJSON); err != nil {
			return err
		}
	}

	return nil
}

func (c *Config) applyMigrations(startVersion int, rawJSON map[string]interface{}) error {
	for v := startVersion; v < CurrentConfigVersion; v++ {
		migrationFunc, exists := migrationRegistry[v]
		if !exists {
			return fmt.Errorf("no migration path from version %d to %d", v, v+1)
		}

		log.Infof("Applying migration: v%d -> v%d", v, v+1)
		if err := migrationFunc(c, rawJSON); err != nil {
			return fmt.Errorf("migration from v%d to v%d failed: %w", v, v+1, err)
		}
		c.Version = v + 1
	}
	return nil
}
