package watchdog

import (
	"fmt"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/discovery"
	"github.com/daniellavrushin/b4/log"
	"github.com/google/uuid"
)

func applyDiscoveryResult(cfg *config.Config, domain string, suite *discovery.CheckSuite, saveFunc func(*config.Config) error) error {
	domainResult, ok := suite.DomainDiscoveryResults[domain]
	if !ok {
		return fmt.Errorf("no discovery result for domain %s", domain)
	}
	if !domainResult.BestSuccess {
		return fmt.Errorf("no successful preset found for domain %s", domain)
	}

	bestResult, ok := domainResult.Results[domainResult.BestPreset]
	if !ok || bestResult.Set == nil {
		return fmt.Errorf("best preset %q has no set config for domain %s", domainResult.BestPreset, domain)
	}

	var targetSet *config.SetConfig
	var targetSetName string
	for _, set := range cfg.Sets {
		for _, sni := range set.Targets.SNIDomains {
			if sni == domain {
				targetSet = set
				targetSetName = set.Name
				break
			}
		}
		if targetSet != nil {
			break
		}
	}

	if targetSet != nil {
		oldStrategy := targetSet.Fragmentation.Strategy
		targetSet.TCP = bestResult.Set.TCP
		targetSet.UDP = bestResult.Set.UDP
		targetSet.Fragmentation = bestResult.Set.Fragmentation
		targetSet.Faking = bestResult.Set.Faking
		log.Infof("[WATCHDOG] %s: applied to set %q (strategy: %s -> %s)", domain, targetSetName, oldStrategy, bestResult.Set.Fragmentation.Strategy)
	} else {
		newSet := config.NewSetConfig()
		newSet.Id = uuid.New().String()
		newSet.Name = "watchdog-" + domain
		newSet.Enabled = true
		newSet.Targets.SNIDomains = []string{domain}
		newSet.TCP = bestResult.Set.TCP
		newSet.UDP = bestResult.Set.UDP
		newSet.Fragmentation = bestResult.Set.Fragmentation
		newSet.Faking = bestResult.Set.Faking
		cfg.Sets = append([]*config.SetConfig{&newSet}, cfg.Sets...)
		log.Infof("[WATCHDOG] %s: created new set %q (strategy: %s)", domain, newSet.Name, newSet.Fragmentation.Strategy)
	}

	return saveFunc(cfg)
}
