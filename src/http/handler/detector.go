package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"

	"github.com/daniellavrushin/b4/detector"
	"github.com/daniellavrushin/b4/log"
)

func (api *API) RegisterDetectorApi() {
	api.mux.HandleFunc("/api/detector/start", api.handleStartDetector)
	api.mux.HandleFunc("/api/detector/status/{id}", api.handleDetectorStatus)
	api.mux.HandleFunc("/api/detector/cancel/{id}", api.handleCancelDetector)
	api.mux.HandleFunc("/api/detector/history", api.handleDetectorHistory)
	api.mux.HandleFunc("/api/detector/history/clear", api.handleClearDetectorHistory)
	api.mux.HandleFunc("/api/detector/history/{id}", api.handleDeleteDetectorHistoryEntry)
}

func (api *API) handleStartDetector(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req DetectorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Errorf("Failed to decode detector request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Tests) == 0 {
		http.Error(w, "At least one test type is required", http.StatusBadRequest)
		return
	}

	// Validate test types
	var tests []detector.TestType
	for _, t := range req.Tests {
		switch t {
		case "dns":
			tests = append(tests, detector.TestDNS)
		case "domains":
			tests = append(tests, detector.TestDomains)
		case "tcp":
			tests = append(tests, detector.TestTCP)
		case "sni":
			tests = append(tests, detector.TestSNI)
		default:
			http.Error(w, fmt.Sprintf("Unknown test type: %s", t), http.StatusBadRequest)
			return
		}
	}

	// Enforce ordering: dns → domains → tcp → sni
	testOrder := map[detector.TestType]int{
		detector.TestDNS: 0, detector.TestDomains: 1,
		detector.TestTCP: 2, detector.TestSNI: 3,
	}
	sort.Slice(tests, func(i, j int) bool {
		return testOrder[tests[i]] < testOrder[tests[j]]
	})

	suite := detector.NewDetectorSuite(tests)

	go func() {
		suite.Run(api.cfg.ConfigPath)
		log.Infof("Detector suite %s complete", suite.Id)
	}()

	response := DetectorResponse{
		Id:             suite.Id,
		Tests:          req.Tests,
		EstimatedTests: suite.TotalChecks,
		Message:        fmt.Sprintf("Detection started with %d test(s)", len(tests)),
	}

	setJsonHeader(w)
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(response)
}

func (api *API) handleDetectorStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Suite ID required", http.StatusBadRequest)
		return
	}

	suite, ok := detector.GetSuite(id)
	if !ok {
		http.Error(w, "Suite not found", http.StatusNotFound)
		return
	}

	setJsonHeader(w)
	json.NewEncoder(w).Encode(suite)
}

func (api *API) handleCancelDetector(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Suite ID required", http.StatusBadRequest)
		return
	}

	if err := detector.CancelSuite(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	log.Infof("Canceled detector suite %s", id)

	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Detector suite canceled",
	})
}

func (api *API) handleDetectorHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	history := detector.GetHistory(api.cfg.ConfigPath)
	setJsonHeader(w)
	json.NewEncoder(w).Encode(history.Entries)
}

func (api *API) handleClearDetectorHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	history := detector.LoadDetectorHistory(api.cfg.ConfigPath)
	history.Clear()
	if err := history.Save(api.cfg.ConfigPath); err != nil {
		log.Errorf("Failed to clear detector history: %v", err)
		http.Error(w, "Failed to clear detector history", http.StatusInternalServerError)
		return
	}

	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Detector history cleared",
	})
}

func (api *API) handleDeleteDetectorHistoryEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Entry ID required", http.StatusBadRequest)
		return
	}

	history := detector.LoadDetectorHistory(api.cfg.ConfigPath)
	history.RemoveEntry(id)
	if err := history.Save(api.cfg.ConfigPath); err != nil {
		log.Errorf("Failed to save detector history: %v", err)
		http.Error(w, "Failed to save detector history", http.StatusInternalServerError)
		return
	}

	setJsonHeader(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Removed history entry %s", id),
	})
}
