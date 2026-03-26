package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/geodat"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/nfq"
	"github.com/daniellavrushin/b4/utils"
	"golang.org/x/sys/unix"
)

// These variables are set at build time via ldflags
var (
	Version = "dev"
	Commit  = "unknown"
	Date    = "unknown"
)

type ConfigRefresher interface {
	UpdateConfig(newCfg *config.Config)
}

var (
	globalPool         *nfq.Pool
	globalSocks5Server ConfigRefresher
	tablesRefreshFunc  func() error
	routingSyncFunc    func(*config.Config)
)

func setJsonHeader(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
}

func writeJsonError(w http.ResponseWriter, status int, message string) {
	setJsonHeader(w)
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func SetNFQPool(pool *nfq.Pool) {
	globalPool = pool
}

func SetSocks5Server(s ConfigRefresher) {
	globalSocks5Server = s
}

func NewAPIHandler(cfg *config.Config) *API {
	// Initialize geodata manager
	geodataManager := geodat.NewGeodataManager(cfg.System.Geo.GeoSitePath, cfg.System.Geo.GeoIpPath)

	// Preload geosite categories if configured
	geositeCategories := []string{}
	if len(cfg.Sets) > 0 {
		for _, set := range cfg.Sets {
			if len(set.Targets.GeoSiteCategories) > 0 {
				geositeCategories = append(geositeCategories, set.Targets.GeoSiteCategories...)
			}
		}
	}
	geositeCategories = utils.FilterUniqueStrings(geositeCategories)

	if cfg.System.Geo.GeoSitePath != "" && len(geositeCategories) > 0 {
		_, err := geodataManager.PreloadCategories(geodat.GEOSITE, geositeCategories)
		if err != nil {
			log.Errorf("Failed to preload categories: %v", err)
		}
	}

	geoipCategories := []string{}
	if len(cfg.Sets) > 0 {
		for _, set := range cfg.Sets {
			if len(set.Targets.GeoIpCategories) > 0 {
				geoipCategories = append(geoipCategories, set.Targets.GeoIpCategories...)
			}
		}
	}
	geoipCategories = utils.FilterUniqueStrings(geoipCategories)

	if cfg.System.Geo.GeoIpPath != "" && len(geoipCategories) > 0 {
		_, err := geodataManager.PreloadCategories(geodat.GEOIP, geoipCategories)
		if err != nil {
			log.Errorf("Failed to preload categories: %v", err)
		}
	}

	return &API{
		cfg:            cfg,
		geodataManager: geodataManager,
		deviceAliases:  config.NewDeviceAliases(cfg.ConfigPath),
		asnStore:       config.NewAsnStore(cfg.ConfigPath),
	}
}
func (api *API) RegisterEndpoints(mux *http.ServeMux, cfg *config.Config) {

	api.cfg = cfg
	api.mux = mux

	api.geodataManager.UpdatePaths(cfg.System.Geo.GeoSitePath, cfg.System.Geo.GeoIpPath)

	api.RegisterConfigApi()
	api.RegisterMetricsApi()
	api.RegisterGeositeApi()
	api.RegisterGeoipApi()
	api.RegisterSystemApi()
	api.RegisterDiscoveryApi()
	api.RegisterIntegrationApi()
	api.RegisterGeodatApi()
	api.RegisterCaptureApi()
	api.RegisterSetsApi()
	api.RegisterDnsApi()
	api.RegisterDevicesApi()
	api.RegisterSocks5Api()
	api.RegisterMTProtoApi()
	api.RegisterDetectorApi()
	api.RegisterBackupApi()
	api.RegisterAsnApi()
}

func sendResponse(w http.ResponseWriter, response interface{}) {
	setJsonHeader(w)
	json.NewEncoder(w).Encode(response)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func SetTablesRefreshFunc(fn func() error) {
	tablesRefreshFunc = fn
}

func SetRoutingSyncFunc(fn func(*config.Config)) {
	routingSyncFunc = fn
}

func checkDiskSpace(dir string, needed int64) error {
	var stat unix.Statfs_t
	if err := unix.Statfs(dir, &stat); err != nil {
		return fmt.Errorf("failed to check disk space on %s: %v", dir, err)
	}
	available := int64(stat.Bavail) * int64(stat.Bsize)
	if available < needed {
		availMB := float64(available) / (1024 * 1024)
		neededMB := float64(needed) / (1024 * 1024)
		return fmt.Errorf("not enough disk space in %s: %.1f MB available, need %.1f MB", dir, availMB, neededMB)
	}
	return nil
}

func downloadFile(url, destPath string) (int64, error) {
	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch %s: %v", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("remote server returned %s for %s", resp.Status, url)
	}

	dir := filepath.Dir(destPath)

	if resp.ContentLength > 0 {
		if err := checkDiskSpace(dir, resp.ContentLength); err != nil {
			return 0, err
		}
	}

	tmpFile, err := os.CreateTemp(dir, ".download-*.tmp")
	if err != nil {
		return 0, fmt.Errorf("failed to create temp file in %s: %v", dir, err)
	}
	tmpPath := tmpFile.Name()

	cleanup := func() {
		tmpFile.Close()
		os.Remove(tmpPath)
	}

	size, err := io.Copy(tmpFile, resp.Body)
	if err != nil {
		cleanup()
		return 0, fmt.Errorf("failed to write data to disk (%d bytes written): %v", size, err)
	}

	if err := tmpFile.Sync(); err != nil {
		cleanup()
		return 0, fmt.Errorf("failed to flush data to disk: %v", err)
	}

	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return 0, fmt.Errorf("failed to finalize file write: %v", err)
	}

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return 0, fmt.Errorf("failed to move downloaded file to %s: %v", destPath, err)
	}

	return size, nil
}
