package http

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/daniellavrushin/b4/config"
)

var (
	activeTokens   = make(map[string]bool)
	activeTokensMu sync.RWMutex
)

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func registerAuthEndpoints(mux *http.ServeMux, cfg *config.Config) {
	mux.HandleFunc("/api/auth/login", handleLogin(cfg))
	mux.HandleFunc("/api/auth/check", handleAuthCheck(cfg))
	mux.HandleFunc("/api/auth/logout", handleLogout)
}

func handleLogin(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeAuthJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
			return
		}

		if !authEnabled(cfg) {
			writeAuthJSON(w, http.StatusOK, map[string]interface{}{"auth_required": false})
			return
		}

		expectedUser := cfg.System.WebServer.Username
		expectedPass := cfg.System.WebServer.Password

		if subtle.ConstantTimeCompare([]byte(req.Username), []byte(expectedUser)) != 1 ||
			subtle.ConstantTimeCompare([]byte(req.Password), []byte(expectedPass)) != 1 {
			writeAuthJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
			return
		}

		token, err := generateToken()
		if err != nil {
			writeAuthJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		activeTokensMu.Lock()
		activeTokens[token] = true
		activeTokensMu.Unlock()

		writeAuthJSON(w, http.StatusOK, map[string]string{"token": token})
	}
}

func handleAuthCheck(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !authEnabled(cfg) {
			writeAuthJSON(w, http.StatusOK, map[string]bool{"auth_required": false})
			return
		}

		token := extractBearerToken(r)
		if token == "" {
			writeAuthJSON(w, http.StatusOK, map[string]interface{}{"auth_required": true, "authenticated": false})
			return
		}

		activeTokensMu.RLock()
		valid := activeTokens[token]
		activeTokensMu.RUnlock()

		writeAuthJSON(w, http.StatusOK, map[string]interface{}{"auth_required": true, "authenticated": valid})
	}
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := extractBearerToken(r)
	if token != "" {
		activeTokensMu.Lock()
		delete(activeTokens, token)
		activeTokensMu.Unlock()
	}

	writeAuthJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func authMiddleware(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authEnabled(cfg) {
			next.ServeHTTP(w, r)
			return
		}

		// Allow auth endpoints without token
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			next.ServeHTTP(w, r)
			return
		}

		// Allow non-API requests (SPA static files) without token —
		// the SPA itself will check auth and show the login page
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		token := extractBearerToken(r)
		if token == "" {
			writeAuthJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		activeTokensMu.RLock()
		valid := activeTokens[token]
		activeTokensMu.RUnlock()

		if !valid {
			writeAuthJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func authEnabled(cfg *config.Config) bool {
	return cfg.System.WebServer.Username != "" && cfg.System.WebServer.Password != ""
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") &&
		strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	// Fallback to query parameter only for WebSocket connections
	if isWebSocketRequest(r) || strings.HasPrefix(r.URL.Path, "/api/ws/") {
		if t := r.URL.Query().Get("token"); t != "" {
			return t
		}
	}
	return ""
}

func writeAuthJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
