package handler

import (
	"net/http"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/discovery"
	"github.com/daniellavrushin/b4/geodat"
)

type API struct {
	cfg            *config.Config
	mux            *http.ServeMux
	geodataManager *geodat.GeodataManager
	discoveryRT    *discovery.Runtime
	deviceAliases  *config.DeviceAliases
	asnStore       *config.AsnStore

	// overrideServiceManager is used in tests to stub detectServiceManager
	overrideServiceManager func() string
}
