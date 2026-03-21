package handler

import (
	"encoding/json"
	"net/http"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/geodat"
	"github.com/daniellavrushin/b4/log"
	"github.com/daniellavrushin/b4/nfq"
	"github.com/daniellavrushin/b4/utils"
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
