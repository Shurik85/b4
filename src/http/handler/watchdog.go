package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/daniellavrushin/b4/log"
)

func (api *API) RegisterWatchdogApi() {
	api.mux.HandleFunc("/api/watchdog/status", api.handleWatchdogStatus)
	api.mux.HandleFunc("/api/watchdog/check", api.handleWatchdogForceCheck)
	api.mux.HandleFunc("/api/watchdog/domains", api.handleWatchdogDomains)
	api.mux.HandleFunc("/api/watchdog/domains/{domain}", api.handleWatchdogDeleteDomain)
	api.mux.HandleFunc("/api/watchdog/enable", api.handleWatchdogEnable)
	api.mux.HandleFunc("/api/watchdog/disable", api.handleWatchdogDisable)
}

func (api *API) handleWatchdogStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if globalWatchdog == nil {
		setJsonHeader(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled": false,
			"domains": []interface{}{},
		})
		return
	}

	state := globalWatchdog.GetState()
	setJsonHeader(w)
	json.NewEncoder(w).Encode(state)
}

func (api *API) handleWatchdogForceCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if globalWatchdog == nil {
		http.Error(w, "watchdog is not running", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Domain == "" {
		http.Error(w, "domain is required", http.StatusBadRequest)
		return
	}

	globalWatchdog.ForceCheck(req.Domain)
	log.Infof("[WATCHDOG] forced check requested for %s", req.Domain)

	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "check scheduled for " + req.Domain,
	})
}

func (api *API) handleWatchdogDomains(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Domain == "" {
		http.Error(w, "domain is required", http.StatusBadRequest)
		return
	}

	cfg := api.getCfg().Clone()
	domain := strings.TrimSpace(req.Domain)

	for _, d := range cfg.System.Checker.Watchdog.Domains {
		if d == domain {
			http.Error(w, "domain already in watchdog list", http.StatusConflict)
			return
		}
	}

	cfg.System.Checker.Watchdog.Domains = append(cfg.System.Checker.Watchdog.Domains, domain)
	if err := api.saveAndPushConfig(cfg); err != nil {
		log.Errorf("Failed to save watchdog config: %v", err)
		http.Error(w, "failed to save configuration", http.StatusInternalServerError)
		return
	}

	log.Infof("[WATCHDOG] added domain %s to watch list", domain)
	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "added " + domain + " to watchdog",
	})
}

func (api *API) handleWatchdogDeleteDomain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	domain := r.PathValue("domain")
	if domain == "" {
		http.Error(w, "domain is required", http.StatusBadRequest)
		return
	}

	cfg := api.getCfg().Clone()
	found := false
	var filtered []string
	for _, d := range cfg.System.Checker.Watchdog.Domains {
		if d == domain {
			found = true
			continue
		}
		filtered = append(filtered, d)
	}

	if !found {
		http.Error(w, "domain not found in watchdog list", http.StatusNotFound)
		return
	}

	cfg.System.Checker.Watchdog.Domains = filtered
	if err := api.saveAndPushConfig(cfg); err != nil {
		log.Errorf("Failed to save watchdog config: %v", err)
		http.Error(w, "failed to save configuration", http.StatusInternalServerError)
		return
	}

	log.Infof("[WATCHDOG] removed domain %s from watch list", domain)
	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "removed " + domain + " from watchdog",
	})
}

func (api *API) handleWatchdogEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	cfg := api.getCfg().Clone()
	cfg.System.Checker.Watchdog.Enabled = true
	if err := api.saveAndPushConfig(cfg); err != nil {
		log.Errorf("Failed to save watchdog config: %v", err)
		http.Error(w, "failed to save configuration", http.StatusInternalServerError)
		return
	}

	log.Infof("[WATCHDOG] enabled")
	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "watchdog enabled",
	})
}

func (api *API) handleWatchdogDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	cfg := api.getCfg().Clone()
	cfg.System.Checker.Watchdog.Enabled = false
	if err := api.saveAndPushConfig(cfg); err != nil {
		log.Errorf("Failed to save watchdog config: %v", err)
		http.Error(w, "failed to save configuration", http.StatusInternalServerError)
		return
	}

	log.Infof("[WATCHDOG] disabled")
	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "watchdog disabled",
	})
}
