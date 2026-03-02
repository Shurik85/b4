package dhcp

import (
	"bufio"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/daniellavrushin/b4/utils"
)

const arpPath = "/proc/net/arp"

// parseARP reads /proc/net/arp and returns complete entries with private IPs only.
func parseARP() ([]ARPEntry, error) {
	file, err := os.Open(arpPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var entries []ARPEntry
	scanner := bufio.NewScanner(file)

	// Skip header line
	scanner.Scan()

	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 6 {
			continue
		}

		ip := fields[0]
		flags := fields[2]
		mac := fields[3]
		device := fields[5]

		// Only keep complete entries (ATF_COM = 0x2)
		flagVal, err := strconv.ParseUint(flags, 0, 16)
		if err != nil || flagVal&0x2 == 0 {
			continue
		}

		if mac == "00:00:00:00:00:00" || mac == "ff:ff:ff:ff:ff:ff" {
			continue
		}

		// Only keep LAN devices (private IPs)
		parsedIP := net.ParseIP(ip)
		if parsedIP == nil || !utils.IsPrivateIP(parsedIP) {
			continue
		}

		entries = append(entries, ARPEntry{
			IP:     ip,
			MAC:    strings.ToUpper(mac),
			Device: device,
		})
	}

	return entries, scanner.Err()
}

// enrichHostnames tries known DHCP lease file paths to extract MAC->hostname mappings.
// Returns an empty map if no lease files are found. Best-effort only.
func enrichHostnames() map[string]string {
	dnsmasqPaths := []string{
		"/var/lib/misc/dnsmasq.leases",
		"/tmp/dhcp.leases",
		"/var/lib/dnsmasq/dnsmasq.leases",
		"/tmp/dnsmasq.leases",
	}
	for _, p := range dnsmasqPaths {
		if h := parseDnsmasqHostnames(p); len(h) > 0 {
			return h
		}
	}

	iscPaths := []string{
		"/var/lib/dhcp/dhcpd.leases",
		"/var/lib/dhcpd/dhcpd.leases",
	}
	for _, p := range iscPaths {
		if h := parseISCHostnames(p); len(h) > 0 {
			return h
		}
	}

	return make(map[string]string)
}

func parseDnsmasqHostnames(path string) map[string]string {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	result := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 4 && fields[3] != "*" {
			mac := strings.ToUpper(fields[1])
			result[mac] = fields[3]
		}
	}
	return result
}

func parseISCHostnames(path string) map[string]string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	result := make(map[string]string)
	var mac, hostname string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "hardware ethernet ") {
			mac = strings.ToUpper(strings.TrimSuffix(strings.TrimPrefix(line, "hardware ethernet "), ";"))
		} else if strings.HasPrefix(line, "client-hostname ") {
			hostname = strings.Trim(strings.TrimSuffix(strings.TrimPrefix(line, "client-hostname "), ";"), "\"")
		} else if line == "}" {
			if mac != "" && hostname != "" {
				result[mac] = hostname
			}
			mac, hostname = "", ""
		}
	}
	return result
}
