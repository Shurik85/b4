import { ToggleOnIcon } from "@b4.icons";
import { B4Config } from "@models/config";
import {
  B4Slider,
  B4FormGroup,
  B4Section,
  B4Switch,
  B4Alert,
  B4Badge,
} from "@b4.elements";
import { Box, Typography } from "@mui/material";

interface FeatureSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: boolean | string | number | string[],
  ) => void;
}

export const FeatureSettings = ({ config, onChange }: FeatureSettingsProps) => {
  const handleInterfaceToggle = (iface: string) => {
    const current = config.queue.interfaces || [];
    const updated = current.includes(iface)
      ? current.filter((i) => i !== iface)
      : [...current, iface];
    onChange("queue.interfaces", updated);
  };

  return (
    <B4Section
      title="Feature Flags"
      description="Enable or disable advanced features"
      icon={<ToggleOnIcon />}
    >
      <B4FormGroup label="Proto Features" columns={2}>
        <B4Switch
          label="Enable IPv4 Support"
          checked={config.queue.ipv4}
          onChange={(checked: boolean) => onChange("queue.ipv4", checked)}
          description="Enable IPv4 support"
        />
        <B4Switch
          label="Enable IPv6 Support"
          checked={config.queue.ipv6}
          onChange={(checked: boolean) => onChange("queue.ipv6", checked)}
          description="Enable IPv6 support"
        />
      </B4FormGroup>
      <B4FormGroup label="Firewall Features" columns={2}>
        <B4Switch
          label="Skip IPTables/NFTables Setup"
          checked={config.system.tables.skip_setup}
          onChange={(checked: boolean) =>
            onChange("system.tables.skip_setup", checked)
          }
          description="Skip automatic IPTables/NFTables rules configuration"
        />
        <B4Slider
          label="Firewall Monitor Interval in seconds (default 10s)"
          value={config.system.tables.monitor_interval}
          onChange={(value: number) =>
            onChange("system.tables.monitor_interval", value)
          }
          min={0}
          max={120}
          step={5}
          helperText="Interval for monitoring B4 iptables/nftables rules"
          alert={
            config.system.tables.monitor_interval <= 0 && (
              <B4Alert severity="warning">
                Warning: This <strong>disables</strong> automatic monitoring of
                B4 iptables/nftables
              </B4Alert>
            )
          }
        />
        <B4Switch
          label="NAT Masquerade"
          checked={config.system.tables.masquerade}
          onChange={(checked: boolean) =>
            onChange("system.tables.masquerade", checked)
          }
          description="Enable NAT masquerade for container/gateway setups"
        />
      </B4FormGroup>
      {config.system.tables.masquerade && (
        <B4FormGroup label="Masquerade Interface" columns={1}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Select output interface for masquerade (empty = all interfaces)
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {(config.available_ifaces ?? []).map((iface) => {
                const isSelected =
                  config.system.tables.masquerade_interface === iface;
                return (
                  <B4Badge
                    key={iface}
                    label={iface}
                    onClick={() =>
                      onChange(
                        "system.tables.masquerade_interface",
                        isSelected ? "" : iface,
                      )
                    }
                    variant={isSelected ? "filled" : "outlined"}
                    color={"primary"}
                  />
                );
              })}
            </Box>
            {(config.available_ifaces ?? []).length === 0 && (
              <B4Alert severity="warning" sx={{ mt: 1 }}>
                No interfaces detected
              </B4Alert>
            )}
            {!config.system.tables.masquerade_interface && (
              <B4Alert severity="info" sx={{ mt: 1 }}>
                Masquerade will apply to all output interfaces if none is
                selected.
              </B4Alert>
            )}
          </Box>
        </B4FormGroup>
      )}
      <B4FormGroup label="Network Interfaces" columns={1}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Select interfaces to monitor (empty = all interfaces)
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {(config.available_ifaces ?? []).map((iface) => {
              const isSelected = (config.queue.interfaces || []).includes(
                iface,
              );
              return (
                <B4Badge
                  key={iface}
                  label={iface}
                  onClick={() => handleInterfaceToggle(iface)}
                  variant={isSelected ? "filled" : "outlined"}
                  color={"primary"}
                />
              );
            })}
          </Box>
          {(config.available_ifaces ?? []).length === 0 && (
            <B4Alert severity="warning" sx={{ mt: 1 }}>
              No interfaces detected
            </B4Alert>
          )}
          {config.queue.interfaces?.length === 0 && (
            <B4Alert severity="info" sx={{ mt: 1 }}>
              B4 will listen on all available interfaces if none are selected.
            </B4Alert>
          )}
        </Box>
      </B4FormGroup>
    </B4Section>
  );
};
