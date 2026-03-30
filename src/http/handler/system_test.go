package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/daniellavrushin/b4/config"
)

func testCfgPtr(cfg *config.Config) *atomic.Pointer[config.Config] {
	p := &atomic.Pointer[config.Config]{}
	p.Store(cfg)
	return p
}

func TestHandleVersion(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{cfgPtr: testCfgPtr(&cfg)}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	t.Run("GET returns version info", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}

		var info VersionInfo
		if err := json.NewDecoder(rec.Body).Decode(&info); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if info.Version == "" {
			t.Error("version should not be empty")
		}
	})

	t.Run("POST not allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/version", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected 405, got %d", rec.Code)
		}
	})
}

func TestHandleSystemInfo(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{cfgPtr: testCfgPtr(&cfg)}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	t.Run("GET returns system info", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/system/info", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}

		var info SystemInfo
		if err := json.NewDecoder(rec.Body).Decode(&info); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if info.OS == "" {
			t.Error("OS should not be empty")
		}
		if info.Arch == "" {
			t.Error("Arch should not be empty")
		}
	})

	t.Run("POST not allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/system/info", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected 405, got %d", rec.Code)
		}
	})
}

func TestHandleCacheStats_NoWorkers(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{cfgPtr: testCfgPtr(&cfg)}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	// globalPool is nil
	globalPool = nil

	req := httptest.NewRequest(http.MethodGet, "/api/system/cache", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when no workers, got %d", rec.Code)
	}
}

func TestHandleRestart_Standalone(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{
		cfgPtr:                 testCfgPtr(&cfg),
		overrideServiceManager: func() string { return "standalone" },
	}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	req := httptest.NewRequest(http.MethodPost, "/api/system/restart", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Should return 400 for standalone
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for standalone, got %d", rec.Code)
	}

	var resp RestartResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	if resp.Success {
		t.Error("restart should fail for standalone")
	}
	if resp.ServiceManager != "standalone" {
		t.Errorf("expected standalone service manager, got %s", resp.ServiceManager)
	}
}

func TestHandleUpdate_InvalidBody(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{cfgPtr: testCfgPtr(&cfg)}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	req := httptest.NewRequest(http.MethodPost, "/api/system/update", strings.NewReader("invalid json"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", rec.Code)
	}
}

func TestHandleUpdate_MethodNotAllowed(t *testing.T) {
	cfg := config.NewConfig()
	api := &API{cfgPtr: testCfgPtr(&cfg)}
	mux := http.NewServeMux()
	api.mux = mux
	api.RegisterSystemApi()

	req := httptest.NewRequest(http.MethodGet, "/api/system/update", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rec.Code)
	}
}
