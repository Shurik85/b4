package watchdog

import (
	"time"
)

type DomainStatus struct {
	Domain              string    `json:"domain"`
	Status              string    `json:"status"`
	LastCheck           time.Time `json:"last_check"`
	LastFailure         time.Time `json:"last_failure,omitempty"`
	LastHeal            time.Time `json:"last_heal,omitempty"`
	ConsecutiveFailures int       `json:"consecutive_failures"`
	Interval            int       `json:"interval_sec"`
	CooldownUntil       time.Time `json:"cooldown_until,omitempty"`
	LastError           string    `json:"last_error,omitempty"`
	LastSpeed           float64   `json:"last_speed,omitempty"`
}

type CheckResult struct {
	OK        bool
	Speed     float64
	Error     string
	BytesRead int64
}

type WatchdogState struct {
	Enabled bool            `json:"enabled"`
	Domains []*DomainStatus `json:"domains"`
}

const (
	StatusHealthy    = "healthy"
	StatusDegraded   = "degraded"
	StatusEscalating = "escalating"
	StatusQueued     = "queued"
)
