package nfq

import (
	"testing"

	"github.com/daniellavrushin/b4/config"
)

func newTrackerWithConn() *connStateTracker {
	tracker := &connStateTracker{conns: make(map[string]*connInfo)}
	set := &config.SetConfig{}
	tracker.RegisterOutgoing("10.0.0.1:12345->1.2.3.4:443", set)
	return tracker
}

func TestRecordServerTTL(t *testing.T) {
	tracker := newTrackerWithConn()

	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	info := tracker.conns["10.0.0.1:12345->1.2.3.4:443"]
	if !info.ttlRecorded || info.serverTTL != 52 {
		t.Fatalf("expected TTL=52 recorded, got TTL=%d recorded=%v", info.serverTTL, info.ttlRecorded)
	}
	if !info.responseSeen {
		t.Fatal("responseSeen should be true after RecordServerTTL")
	}

	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 99)
	if info.serverTTL != 52 {
		t.Fatalf("TTL should not change after first recording, got %d", info.serverTTL)
	}
}

func TestRecordServerTTL_NoConnection(t *testing.T) {
	tracker := &connStateTracker{conns: make(map[string]*connInfo)}
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)
}

// --- Layer 1: TTL mismatch ---

func TestCheckRST_TTLExactMatch(t *testing.T) {
	tracker := newTrackerWithConn()
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, _ := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if drop {
		t.Fatal("should NOT drop RST with exact TTL match")
	}
}

func TestCheckRST_TTLWithinTolerance(t *testing.T) {
	tracker := newTrackerWithConn()
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, _ := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 50, 3)
	if drop {
		t.Fatal("should NOT drop RST within tolerance (delta=2, tolerance=3)")
	}
}

func TestCheckRST_TTLMismatch(t *testing.T) {
	tracker := newTrackerWithConn()
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, reason := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 60, 3)
	if !drop {
		t.Fatal("should drop RST with TTL delta=8 (tolerance=3)")
	}
	if reason == "" {
		t.Fatal("should provide reason for TTL mismatch drop")
	}
}

// --- Layer 2: RST before server response ---

func TestCheckRST_BeforeResponse(t *testing.T) {
	tracker := newTrackerWithConn()

	drop, reason := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if !drop {
		t.Fatal("should drop RST when no server response seen yet")
	}
	if reason != "RST before any server response" {
		t.Fatalf("unexpected reason: %s", reason)
	}
}

// --- Layer 3: Multiple RSTs ---

func TestCheckRST_MultipleRSTs(t *testing.T) {
	tracker := newTrackerWithConn()
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, _ := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if drop {
		t.Fatal("first RST with matching TTL should pass")
	}

	drop, reason := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if !drop {
		t.Fatal("second RST should be dropped regardless of TTL")
	}
	if reason == "" {
		t.Fatal("should provide reason for multiple RST drop")
	}
}

func TestCheckRST_MultipleRSTs_EvenWithMatchingTTL(t *testing.T) {
	tracker := newTrackerWithConn()
	tracker.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)

	for i := 2; i <= 5; i++ {
		drop, _ := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
		if !drop {
			t.Fatalf("RST #%d should be dropped (multiple RSTs)", i)
		}
	}
}

// --- No connection tracked ---

func TestCheckRST_NoConnection(t *testing.T) {
	tracker := &connStateTracker{conns: make(map[string]*connInfo)}
	drop, _ := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if drop {
		t.Fatal("should not drop RST for unknown connection")
	}
}

// --- Combined scenario ---

func TestCheckRST_FullFlow(t *testing.T) {
	tracker := newTrackerWithConn()

	drop, reason := tracker.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 60, 3)
	if !drop || reason != "RST before any server response" {
		t.Fatalf("RST before response should be dropped, got drop=%v reason=%s", drop, reason)
	}

	tracker2 := newTrackerWithConn()
	tracker2.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, _ = tracker2.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if drop {
		t.Fatal("first RST with correct TTL after response should pass")
	}

	drop, _ = tracker2.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 52, 3)
	if !drop {
		t.Fatal("second RST should be dropped")
	}

	tracker3 := newTrackerWithConn()
	tracker3.RecordServerTTL("10.0.0.1", 12345, "1.2.3.4", 443, 52)

	drop, reason = tracker3.CheckRST("10.0.0.1", 12345, "1.2.3.4", 443, 64, 3)
	if !drop {
		t.Fatal("RST with mismatched TTL should be dropped")
	}
	if reason == "" {
		t.Fatal("should provide TTL mismatch reason")
	}
}
