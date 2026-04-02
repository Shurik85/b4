package watchdog

import (
	"fmt"
	"strings"

	"github.com/daniellavrushin/b4/config"
	"github.com/daniellavrushin/b4/discovery"
	"github.com/daniellavrushin/b4/log"
	"github.com/google/uuid"
)

type domainWithSet struct {
	domain string
	set    *config.SetConfig
}

func applyBatchResults(cfg *config.Config, domains []string, suite *discovery.CheckSuite, saveFunc func(*config.Config) error) map[string]error {
	results := make(map[string]error)

	var successful []domainWithSet
	for _, domain := range domains {
		dr, ok := suite.DomainDiscoveryResults[domain]
		if !ok || !dr.BestSuccess {
			results[domain] = fmt.Errorf("no working config found")
			continue
		}
		best, ok := dr.Results[dr.BestPreset]
		if !ok || best.Set == nil {
			results[domain] = fmt.Errorf("best preset has no set config")
			continue
		}
		successful = append(successful, domainWithSet{domain: domain, set: best.Set})
	}

	if len(successful) == 0 {
		return results
	}

	groups := groupByConfig(successful)

	for _, group := range groups {
		applyGroup(cfg, group)
	}

	if err := saveFunc(cfg); err != nil {
		for _, ds := range successful {
			results[ds.domain] = err
		}
		return results
	}

	return results
}

func groupByConfig(items []domainWithSet) [][]domainWithSet {
	var groups [][]domainWithSet
	used := make(map[int]bool)

	for i := 0; i < len(items); i++ {
		if used[i] {
			continue
		}
		group := []domainWithSet{items[i]}
		used[i] = true
		for j := i + 1; j < len(items); j++ {
			if used[j] {
				continue
			}
			if configsMatch(items[i].set, items[j].set) {
				group = append(group, items[j])
				used[j] = true
			}
		}
		groups = append(groups, group)
	}
	return groups
}

func configsMatch(a, b *config.SetConfig) bool {
	return a.Fragmentation.Strategy == b.Fragmentation.Strategy &&
		a.Faking.Strategy == b.Faking.Strategy &&
		a.Faking.TTL == b.Faking.TTL &&
		a.TCP.DropSACK == b.TCP.DropSACK
}

func applyGroup(cfg *config.Config, group []domainWithSet) {
	groupDomains := make([]string, len(group))
	for i, ds := range group {
		groupDomains[i] = ds.domain
	}
	refSet := group[0].set

	var existingSet *config.SetConfig
	for _, set := range cfg.Sets {
		for _, sni := range set.Targets.SNIDomains {
			for _, domain := range groupDomains {
				if sni == domain {
					existingSet = set
					break
				}
			}
			if existingSet != nil {
				break
			}
		}
		if existingSet != nil {
			break
		}
	}

	if existingSet == nil {
		for _, set := range cfg.Sets {
			if !set.Enabled {
				continue
			}
			if configsMatch(set, refSet) {
				existingSet = set
				break
			}
		}
	}

	if existingSet != nil {
		oldStrategy := existingSet.Fragmentation.Strategy
		existingSet.TCP = refSet.TCP
		existingSet.UDP = refSet.UDP
		existingSet.Fragmentation = refSet.Fragmentation
		existingSet.Faking = refSet.Faking

		for _, domain := range groupDomains {
			found := false
			for _, sni := range existingSet.Targets.SNIDomains {
				if sni == domain {
					found = true
					break
				}
			}
			if !found {
				existingSet.Targets.SNIDomains = append(existingSet.Targets.SNIDomains, domain)
			}
		}

		log.Infof("[WATCHDOG] %s: applied to set %q (strategy: %s -> %s)",
			strings.Join(groupDomains, ", "), existingSet.Name, oldStrategy, refSet.Fragmentation.Strategy)
	} else {
		newSet := config.NewSetConfig()
		newSet.Id = uuid.New().String()
		newSet.Name = "watchdog-" + groupDomains[0]
		newSet.Enabled = true
		newSet.Targets.SNIDomains = groupDomains
		newSet.TCP = refSet.TCP
		newSet.UDP = refSet.UDP
		newSet.Fragmentation = refSet.Fragmentation
		newSet.Faking = refSet.Faking
		cfg.Sets = append([]*config.SetConfig{&newSet}, cfg.Sets...)
		log.Infof("[WATCHDOG] %s: created set %q (strategy: %s)",
			strings.Join(groupDomains, ", "), newSet.Name, refSet.Fragmentation.Strategy)
	}
}
