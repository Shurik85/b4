import { Box, MenuItem, Typography } from "@mui/material";
import {
  B4Alert,
  B4Badge,
  B4FormGroup,
  B4Section,
  B4Switch,
  B4TextField,
} from "@b4.elements";
import { B4SetConfig } from "@models/config";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import { useTranslation } from "react-i18next";

interface RoutingSettingsProps {
  set: B4SetConfig;
  availableIfaces: string[];
  onChange: (
    field: string,
    value: string | number | boolean | string[] | number[] | null | undefined,
  ) => void;
}

export const RoutingSettings = ({
  set,
  availableIfaces,
  onChange,
}: RoutingSettingsProps) => {
  const { t } = useTranslation();
  const routing = set.routing;
  const selectedIfaceAvailable = availableIfaces.includes(
    routing.egress_interface,
  );
  const shouldShowUnavailableSelected = Boolean(
    routing.egress_interface && !selectedIfaceAvailable,
  );

  const toggleSourceIface = (iface: string) => {
    const current = routing.source_interfaces || [];
    const updated = current.includes(iface)
      ? current.filter((i) => i !== iface)
      : [...current, iface];
    onChange("routing.source_interfaces", updated);
  };

  return (
    <B4Section
      title={t("sets.routing.sectionTitle")}
      description={t("sets.routing.sectionDescription")}
      icon={<AltRouteIcon />}
    >
      <B4FormGroup label={t("sets.routing.rule")} columns={2}>
        <B4Switch
          label={t("sets.routing.enable")}
          checked={routing.enabled}
          onChange={(checked: boolean) => onChange("routing.enabled", checked)}
          description={t("sets.routing.enableDesc")}
          disabled={availableIfaces.length === 0}
        />

        <B4TextField
          label={t("sets.routing.outputInterface")}
          select
          value={routing.egress_interface}
          onChange={(e) => onChange("routing.egress_interface", e.target.value)}
          disabled={!routing.enabled}
          helperText={
            shouldShowUnavailableSelected
              ? t("sets.routing.interfaceUnavailable")
              : t("sets.routing.outputInterfaceHelper")
          }
        >
          {shouldShowUnavailableSelected && (
            <MenuItem value={routing.egress_interface}>
              {t("sets.routing.interfaceUnavailableOption", {
                iface: routing.egress_interface,
              })}
            </MenuItem>
          )}
          {availableIfaces.map((iface) => (
            <MenuItem key={iface} value={iface}>
              {iface}
            </MenuItem>
          ))}
        </B4TextField>

        <B4TextField
          label={t("sets.routing.ipTtl")}
          type="number"
          value={routing.ip_ttl_seconds}
          onChange={(e) =>
            onChange("routing.ip_ttl_seconds", Number(e.target.value))
          }
          disabled={!routing.enabled}
          helperText={t("sets.routing.ipTtlHelper")}
        />
      </B4FormGroup>

      <B4FormGroup label={t("sets.routing.sourceInterfaces")} columns={1}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("sets.routing.sourceInterfacesHint")}
          </Typography>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {availableIfaces.map((iface) => {
              const selected = (routing.source_interfaces || []).includes(iface);
              return (
                <B4Badge
                  key={iface}
                  label={iface}
                  onClick={() => toggleSourceIface(iface)}
                  variant={selected ? "filled" : "outlined"}
                  color={selected ? "secondary" : "primary"}
                />
              );
            })}
          </Box>

          {availableIfaces.length === 0 && (
            <B4Alert severity="warning" sx={{ mt: 2 }}>
              {t("sets.routing.noInterfaces")}
            </B4Alert>
          )}

          {routing.enabled && shouldShowUnavailableSelected && (
            <B4Alert severity="warning" sx={{ mt: 2 }}>
              {t("sets.routing.unavailableWarning", {
                iface: routing.egress_interface,
              })}
            </B4Alert>
          )}

          {routing.enabled && (
            <B4Alert severity="info" sx={{ mt: 2 }}>
              {t("sets.routing.info")}
            </B4Alert>
          )}
        </Box>
      </B4FormGroup>
    </B4Section>
  );
};
