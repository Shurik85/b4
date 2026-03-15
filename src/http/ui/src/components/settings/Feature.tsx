import { useTranslation } from "react-i18next";
import { ToggleOnIcon } from "@b4.icons";
import { B4Config } from "@models/config";
import {
  B4Slider,
  B4FormGroup,
  B4Section,
  B4Switch,
  B4Select,
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
  const { t } = useTranslation();

  const handleInterfaceToggle = (iface: string) => {
    const current = config.queue.interfaces || [];
    const updated = current.includes(iface)
      ? current.filter((i) => i !== iface)
      : [...current, iface];
    onChange("queue.interfaces", updated);
  };

  return (
    <B4Section
      title={t("settings.Feature.title")}
      description={t("settings.Feature.description")}
      icon={<ToggleOnIcon />}
    >
      <B4FormGroup label={t("settings.Feature.protoFeatures")} columns={2}>
        <B4Switch
          label={t("settings.Feature.enableIPv4")}
          checked={config.queue.ipv4}
          onChange={(checked: boolean) => onChange("queue.ipv4", checked)}
          description={t("settings.Feature.enableIPv4Desc")}
        />
        <B4Switch
          label={t("settings.Feature.enableIPv6")}
          checked={config.queue.ipv6}
          onChange={(checked: boolean) => onChange("queue.ipv6", checked)}
          description={t("settings.Feature.enableIPv6Desc")}
        />
      </B4FormGroup>
      <B4FormGroup label={t("settings.Feature.firewallFeatures")} columns={2}>
        <B4Switch
          label={t("settings.Feature.skipIptables")}
          checked={config.system.tables.skip_setup}
          onChange={(checked: boolean) =>
            onChange("system.tables.skip_setup", checked)
          }
          description={t("settings.Feature.skipIptablesDesc")}
        />
        <B4Slider
          label={t("settings.Feature.firewallMonitorInterval")}
          value={config.system.tables.monitor_interval}
          onChange={(value: number) =>
            onChange("system.tables.monitor_interval", value)
          }
          min={0}
          max={120}
          step={5}
          helperText={t("settings.Feature.firewallMonitorHelp")}
          alert={
            config.system.tables.monitor_interval <= 0 && (
              <B4Alert severity="warning">
                {t("settings.Feature.firewallMonitorWarning")}
              </B4Alert>
            )
          }
        />
        <B4Select
          label={t("settings.Feature.firewallEngine")}
          value={config.system.tables.engine || "auto"}
          onChange={(e) =>
            onChange(
              "system.tables.engine",
              e.target.value === "auto" ? "" : (e.target.value as string),
            )
          }
          options={[
            { value: "auto", label: t("settings.Feature.engineAuto") },
            { value: "nftables", label: "nftables" },
            { value: "iptables", label: "iptables" },
            { value: "iptables-legacy", label: "iptables-legacy" },
          ]}
          helperText={t("settings.Feature.firewallEngineHelp")}
        />
        <B4Switch
          label={t("settings.Feature.natMasquerade")}
          checked={config.system.tables.masquerade}
          onChange={(checked: boolean) =>
            onChange("system.tables.masquerade", checked)
          }
          description={t("settings.Feature.natMasqueradeDesc")}
        />
      </B4FormGroup>
      {config.system.tables.masquerade && (
        <B4FormGroup label={t("settings.Feature.masqueradeInterface")} columns={1}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("settings.Feature.masqueradeInterfaceDesc")}
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
                {t("settings.Feature.noInterfacesDetected")}
              </B4Alert>
            )}
            {!config.system.tables.masquerade_interface && (
              <B4Alert severity="info" sx={{ mt: 1 }}>
                {t("settings.Feature.masqueradeAllInterfaces")}
              </B4Alert>
            )}
          </Box>
        </B4FormGroup>
      )}
      <B4FormGroup label={t("settings.Feature.networkInterfaces")} columns={1}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("settings.Feature.networkInterfacesDesc")}
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
              {t("settings.Feature.noInterfacesDetected")}
            </B4Alert>
          )}
          {config.queue.interfaces?.length === 0 && (
            <B4Alert severity="info" sx={{ mt: 1 }}>
              {t("settings.Feature.listenAllInterfaces")}
            </B4Alert>
          )}
        </Box>
      </B4FormGroup>
    </B4Section>
  );
};
