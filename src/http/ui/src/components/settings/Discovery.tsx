import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Grid, IconButton } from "@mui/material";
import { AddIcon, DiscoveryIcon } from "@b4.icons";
import { B4Config } from "@models/config";
import { colors } from "@design";
import {
  B4Slider,
  B4Section,
  B4TextField,
  B4FormHeader,
  B4ChipList,
} from "@b4.elements";

interface CheckerSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: string | boolean | number | string[]
  ) => void;
}

export const CheckerSettings = ({ config, onChange }: CheckerSettingsProps) => {
  const { t } = useTranslation();
  const [newDns, setNewDns] = useState("");

  const handleAddDns = () => {
    if (newDns.trim()) {
      const current = config.system.checker.reference_dns || [];
      if (!current.includes(newDns.trim())) {
        onChange("system.checker.reference_dns", [...current, newDns.trim()]);
      }
      setNewDns("");
    }
  };

  const handleRemoveDns = (dns: string) => {
    const current = config.system.checker.reference_dns || [];
    onChange(
      "system.checker.reference_dns",
      current.filter((s) => s !== dns)
    );
  };

  return (
    <B4Section
      title={t("settings.Checker.title")}
      description={t("settings.Checker.description")}
      icon={<DiscoveryIcon />}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <B4Slider
            label={t("settings.Checker.discoveryTimeout")}
            value={config.system.checker.discovery_timeout || 5}
            onChange={(value) =>
              onChange("system.checker.discovery_timeout", value)
            }
            min={3}
            max={30}
            step={1}
            valueSuffix=" sec"
            helperText={t("settings.Checker.discoveryTimeoutHelp")}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <B4Slider
            label={t("settings.Checker.configPropagation")}
            value={config.system.checker.config_propagate_ms || 1500}
            onChange={(value) =>
              onChange("system.checker.config_propagate_ms", value)
            }
            min={500}
            max={5000}
            step={100}
            valueSuffix=" ms"
            helperText={t("settings.Checker.configPropagationHelp")}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <B4TextField
            label={t("settings.Checker.referenceDomain")}
            value={config.system.checker.reference_domain || "yandex.ru"}
            onChange={(e) =>
              onChange("system.checker.reference_domain", e.target.value)
            }
            placeholder="yandex.ru"
            helperText={t("settings.Checker.referenceDomainHelp")}
          />
        </Grid>

        <B4FormHeader label={t("settings.Checker.dnsConfig")} />
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <B4TextField
              label={t("settings.Checker.addDns")}
              value={newDns}
              onChange={(e) => setNewDns(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddDns();
                }
              }}
              placeholder="e.g., 8.8.8.8"
              helperText={t("settings.Checker.addDnsHelp")}
            />
            <IconButton
              onClick={handleAddDns}
              sx={{
                bgcolor: colors.accent.secondary,
                color: colors.secondary,
                "&:hover": { bgcolor: colors.accent.secondaryHover },
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>
        </Grid>
        <B4ChipList
          items={config.system.checker.reference_dns || []}
          getKey={(d) => d}
          getLabel={(d) => d}
          onDelete={handleRemoveDns}
          title={t("settings.Checker.activeDns")}
          gridSize={{ xs: 12, md: 6 }}
        />
      </Grid>
    </B4Section>
  );
};
