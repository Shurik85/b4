package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMarshalSparse_OmitsDefaults(t *testing.T) {
	cfg := NewConfig()
	set := NewSetConfig()
	set.Id = "test-set"
	set.Name = "Test"
	cfg.Sets = []*SetConfig{&set}

	data, err := MarshalSparse(&cfg)
	if err != nil {
		t.Fatalf("MarshalSparse failed: %v", err)
	}

	var raw map[string]interface{}
	json.Unmarshal(data, &raw)

	if _, ok := raw["queue"]; ok {
		t.Error("sparse output should not contain 'queue' when all values are defaults")
	}
	if _, ok := raw["version"]; !ok {
		t.Error("sparse output must always contain 'version'")
	}
	if _, ok := raw["sets"]; !ok {
		t.Error("sparse output must always contain 'sets'")
	}
}

func TestMarshalSparse_KeepsNonDefaults(t *testing.T) {
	cfg := NewConfig()
	cfg.Queue.StartNum = 999
	cfg.Queue.Threads = 16
	cfg.System.WebServer.Port = 9999

	set := NewSetConfig()
	set.Id = "test-set"
	set.Name = "Test"
	set.Fragmentation.Strategy = "ip"
	set.Faking.TTL = 42
	cfg.Sets = []*SetConfig{&set}

	data, err := MarshalSparse(&cfg)
	if err != nil {
		t.Fatalf("MarshalSparse failed: %v", err)
	}

	var raw map[string]interface{}
	json.Unmarshal(data, &raw)

	queue, ok := raw["queue"].(map[string]interface{})
	if !ok {
		t.Fatal("expected 'queue' in sparse output")
	}
	if queue["start_num"] != float64(999) {
		t.Errorf("expected start_num=999, got %v", queue["start_num"])
	}
	if queue["threads"] != float64(16) {
		t.Errorf("expected threads=16, got %v", queue["threads"])
	}

	sets, ok := raw["sets"].([]interface{})
	if !ok || len(sets) != 1 {
		t.Fatal("expected 1 set in sparse output")
	}
	setMap := sets[0].(map[string]interface{})

	if setMap["id"] != "test-set" {
		t.Error("set id must always be present")
	}
	if setMap["name"] != "Test" {
		t.Error("set name must always be present")
	}

	frag, ok := setMap["fragmentation"].(map[string]interface{})
	if !ok {
		t.Fatal("expected fragmentation in set")
	}
	if frag["strategy"] != "ip" {
		t.Errorf("expected strategy=ip, got %v", frag["strategy"])
	}
}

func TestSparseSaveLoadRoundtrip(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.json")

	cfg := NewConfig()
	cfg.Queue.StartNum = 888
	cfg.System.WebServer.Port = 3000
	cfg.System.Logging.Level = 3

	set := NewSetConfig()
	set.Id = "my-set"
	set.Name = "Custom"
	set.Enabled = true
	set.Fragmentation.Strategy = "disorder"
	set.Faking.TTL = 12
	set.TCP.Desync.TTL = 3
	set.Targets.SNIDomains = []string{"example.com", "test.org"}
	cfg.Sets = []*SetConfig{&set}

	if err := cfg.SaveToFile(path); err != nil {
		t.Fatalf("SaveToFile failed: %v", err)
	}

	data, _ := os.ReadFile(path)
	var raw map[string]interface{}
	json.Unmarshal(data, &raw)
	if _, ok := raw["queue"].(map[string]interface{})["ipv6_enabled"]; ok {
		t.Error("sparse config should not contain default ipv6_enabled field")
	}

	loaded := NewConfig()
	if err := loaded.LoadFromFile(path); err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	if loaded.Queue.StartNum != 888 {
		t.Errorf("expected StartNum=888, got %d", loaded.Queue.StartNum)
	}
	if loaded.System.WebServer.Port != 3000 {
		t.Errorf("expected WebServer.Port=3000, got %d", loaded.System.WebServer.Port)
	}
	if loaded.Queue.Threads != DefaultConfig.Queue.Threads {
		t.Errorf("expected Threads to be default %d, got %d", DefaultConfig.Queue.Threads, loaded.Queue.Threads)
	}
	if loaded.Queue.IPv4Enabled != DefaultConfig.Queue.IPv4Enabled {
		t.Errorf("expected IPv4Enabled to be default %v, got %v", DefaultConfig.Queue.IPv4Enabled, loaded.Queue.IPv4Enabled)
	}

	if len(loaded.Sets) != 1 {
		t.Fatalf("expected 1 set, got %d", len(loaded.Sets))
	}
	ls := loaded.Sets[0]
	if ls.Id != "my-set" {
		t.Errorf("expected set id=my-set, got %s", ls.Id)
	}
	if ls.Fragmentation.Strategy != "disorder" {
		t.Errorf("expected strategy=disorder, got %s", ls.Fragmentation.Strategy)
	}
	if ls.Faking.TTL != 12 {
		t.Errorf("expected Faking.TTL=12, got %d", ls.Faking.TTL)
	}
	if ls.TCP.Desync.TTL != 3 {
		t.Errorf("expected Desync.TTL=3, got %d", ls.TCP.Desync.TTL)
	}
	if ls.Faking.SNISeqLength != DefaultSetConfig.Faking.SNISeqLength {
		t.Errorf("expected default SNISeqLength=%d, got %d", DefaultSetConfig.Faking.SNISeqLength, ls.Faking.SNISeqLength)
	}
	if ls.UDP.FakeSeqLength != DefaultSetConfig.UDP.FakeSeqLength {
		t.Errorf("expected default FakeSeqLength=%d, got %d", DefaultSetConfig.UDP.FakeSeqLength, ls.UDP.FakeSeqLength)
	}
	if len(ls.Targets.SNIDomains) != 2 {
		t.Errorf("expected 2 SNI domains, got %d", len(ls.Targets.SNIDomains))
	}
}

func TestSparseSaveLoadRoundtrip_BoolDefaults(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.json")

	cfg := NewConfig()
	set := NewSetConfig()
	set.Id = "bool-test"
	set.Name = "Bool"
	set.Enabled = false
	set.Fragmentation.ReverseOrder = false
	set.UDP.FilterSTUN = false
	cfg.Sets = []*SetConfig{&set}

	if err := cfg.SaveToFile(path); err != nil {
		t.Fatalf("SaveToFile failed: %v", err)
	}

	loaded := NewConfig()
	if err := loaded.LoadFromFile(path); err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	ls := loaded.Sets[0]
	if ls.Enabled != false {
		t.Error("expected Enabled=false after roundtrip")
	}
	if ls.Fragmentation.ReverseOrder != false {
		t.Error("expected ReverseOrder=false after roundtrip")
	}
	if ls.UDP.FilterSTUN != false {
		t.Error("expected FilterSTUN=false after roundtrip")
	}
}
