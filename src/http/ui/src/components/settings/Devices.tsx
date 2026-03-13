import { useState, useEffect } from "react";
import {
  Grid,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  IconButton,
  Tooltip,
  TextField,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { DeviceMSSClamp } from "@models/config";
import { DeviceUnknowIcon, RefreshIcon } from "@b4.icons";
import EditIcon from "@mui/icons-material/Edit";
import RestoreIcon from "@mui/icons-material/Restore";
import { colors } from "@design";
import {
  B4Section,
  B4Switch,
  B4Alert,
  B4TooltipButton,
  B4Badge,
  B4InlineEdit,
} from "@b4.elements";
import { useDevices, DeviceInfo, DevicesSettingsProps } from "@b4.devices";
import { sortDevices } from "@utils";

const DeviceNameCell = ({
  device,
  isSelected,
  isEditing,
  onStartEdit,
  onSaveAlias,
  onResetAlias,
  onCancelEdit,
  t,
}: {
  device: DeviceInfo;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveAlias: (alias: string) => Promise<void>;
  onResetAlias: () => Promise<void>;
  onCancelEdit: () => void;
  t: (key: string) => string;
}) => {
  const displayName = device.alias || device.vendor;

  if (isEditing) {
    return (
      <B4InlineEdit
        value={device.alias || device.vendor || ""}
        onSave={onSaveAlias}
        onCancel={onCancelEdit}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {displayName ? (
        <B4Badge
          label={displayName}
          color="primary"
          variant={isSelected ? "filled" : "outlined"}
        />
      ) : (
        <Typography variant="caption" color="text.secondary">
          {t("core.unknown")}
        </Typography>
      )}
      <Tooltip title={t("settings.Devices.editName")}>
        <IconButton
          size="small"
          onClick={onStartEdit}
          sx={{ opacity: 0.6, "&:hover": { opacity: 1 } }}
        >
          <EditIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {device.alias && (
        <Tooltip title={t("settings.Devices.resetToVendor")}>
          <IconButton
            size="small"
            onClick={() => void onResetAlias()}
            sx={{ opacity: 0.6, "&:hover": { opacity: 1 } }}
          >
            <RestoreIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export const DevicesSettings = ({ config, onChange }: DevicesSettingsProps) => {
  const [editingMac, setEditingMac] = useState<string | null>(null);
  const { t } = useTranslation();

  const selectedMacs = config.queue.devices?.mac || [];
  const enabled = config.queue.devices?.enabled || false;
  const vendorLookup = config.queue.devices?.vendor_lookup || false;
  const wisb = config.queue.devices?.wisb || false;
  const mssClamps: DeviceMSSClamp[] = config.queue.devices?.mss_clamps || [];
  const {
    devices,
    loading,
    available,
    source,
    loadDevices,
    setAlias,
    resetAlias,
  } = useDevices();

  useEffect(() => {
    loadDevices().catch(() => {});
  }, [loadDevices]);

  const handleMacToggle = (mac: string) => {
    const current = [...selectedMacs];
    const index = current.indexOf(mac);
    if (index === -1) {
      current.push(mac);
    } else {
      current.splice(index, 1);
    }
    onChange("queue.devices.mac", current);
  };

  const getMSSSize = (mac: string): number | "" => {
    const entry = mssClamps.find(
      (c) => c.mac.toUpperCase() === mac.toUpperCase(),
    );
    return entry ? entry.size : "";
  };

  const handleMSSChange = (mac: string, size: number | null) => {
    const current = [...mssClamps];
    const idx = current.findIndex(
      (c) => c.mac.toUpperCase() === mac.toUpperCase(),
    );
    if (size === null || size === 0) {
      if (idx !== -1) current.splice(idx, 1);
    } else if (idx === -1) {
      current.push({ mac: mac.toUpperCase(), size });
    } else {
      current[idx] = { ...current[idx], size };
    }
    onChange("queue.devices.mss_clamps", current);
  };

  const isSelected = (mac: string) => selectedMacs.includes(mac);
  const allSelected =
    devices.length > 0 && selectedMacs.length === devices.length;
  const someSelected =
    selectedMacs.length > 0 && selectedMacs.length < devices.length;

  const tableHeaders = [
    t("core.devices.macAddress"),
    t("core.devices.ip"),
    t("core.devices.deviceName"),
    t("settings.Devices.mss"),
  ];

  return (
    <B4Section
      title={t("settings.Devices.title")}
      description={t("settings.Devices.description")}
      icon={<DeviceUnknowIcon />}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Box
            sx={{
              display: "flex",
              gap: 3,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <B4Switch
              label={t("settings.Devices.enable")}
              checked={enabled}
              onChange={(checked) => onChange("queue.devices.enabled", checked)}
              description={t("settings.Devices.enableDesc")}
            />
            <B4Switch
              label={t("settings.Devices.vendorLookup")}
              checked={vendorLookup}
              onChange={(checked) =>
                onChange("queue.devices.vendor_lookup", checked)
              }
              description={t("settings.Devices.vendorLookupDesc")}
            />
            <B4Switch
              label={t("settings.Devices.invertSelection")}
              checked={wisb}
              onChange={(checked) => onChange("queue.devices.wisb", checked)}
              description={
                wisb ? t("settings.Devices.invertBlacklist") : t("settings.Devices.invertWhitelist")
              }
              disabled={!enabled}
            />
          </Box>
        </Grid>

        {enabled && (
          <>
            <B4Alert severity={wisb ? "warning" : "info"}>
              {wisb
                ? t("settings.Devices.blacklistAlert")
                : t("settings.Devices.whitelistAlert")}
            </B4Alert>

            {available ? (
              <Grid size={{ xs: 12 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2">
                    {t("core.devices.availableDevices")}
                    {source && (
                      <Chip
                        label={source}
                        size="small"
                        sx={{
                          ml: 1,
                          bgcolor: colors.accent.secondary,
                          color: colors.secondary,
                        }}
                      />
                    )}
                  </Typography>
                  <B4TooltipButton
                    title={t("core.devices.refreshDevices")}
                    icon={
                      loading ? <CircularProgress size={18} /> : <RefreshIcon />
                    }
                    onClick={() => {
                      loadDevices().catch(() => {});
                    }}
                  />
                </Box>

                <TableContainer
                  component={Paper}
                  sx={{
                    bgcolor: colors.background.paper,
                    border: `1px solid ${colors.border.default}`,
                    maxHeight: 300,
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell
                          padding="checkbox"
                          sx={{ bgcolor: colors.background.dark }}
                        >
                          <Checkbox
                            color="secondary"
                            indeterminate={someSelected}
                            checked={allSelected}
                            onChange={(e) =>
                              onChange(
                                "queue.devices.mac",
                                e.target.checked
                                  ? devices.map((d) => d.mac)
                                  : [],
                              )
                            }
                          />
                        </TableCell>
                        {tableHeaders.map((label) => (
                          <TableCell
                            key={label}
                            sx={{
                              bgcolor: colors.background.dark,
                              color: colors.text.secondary,
                            }}
                          >
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            {loading
                              ? t("core.devices.loadingDevices")
                              : t("core.devices.noDevices")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortDevices(devices, isSelected).map((device) => (
                          <TableRow
                            key={device.mac}
                            hover
                            onClick={() => handleMacToggle(device.mac)}
                            sx={{ cursor: "pointer" }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={isSelected(device.mac)}
                                color="secondary"
                              />
                            </TableCell>
                            <TableCell
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                              }}
                            >
                              {device.mac}
                            </TableCell>
                            <TableCell
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                              }}
                            >
                              {device.ip}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <DeviceNameCell
                                device={device}
                                isSelected={isSelected(device.mac)}
                                isEditing={editingMac === device.mac}
                                onStartEdit={() => setEditingMac(device.mac)}
                                onSaveAlias={async (alias) => {
                                  const result = await setAlias(
                                    device.mac,
                                    alias,
                                  );
                                  if (result.success) setEditingMac(null);
                                }}
                                onResetAlias={async () => {
                                  const result = await resetAlias(device.mac);
                                  if (result.success) setEditingMac(null);
                                }}
                                onCancelEdit={() => setEditingMac(null)}
                                t={t}
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <TextField
                                size="small"
                                type="number"
                                value={getMSSSize(device.mac)}
                                onChange={(e) => {
                                  const val =
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value);
                                  handleMSSChange(device.mac, val);
                                }}
                                placeholder="off"
                                slotProps={{
                                  htmlInput: {
                                    min: 10,
                                    max: 1460,
                                    style: { width: 50, padding: "4px 8px" },
                                  },
                                }}
                                sx={{
                                  "& .MuiOutlinedInput-root": {
                                    fontSize: "0.85rem",
                                  },
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            ) : (
              <B4Alert severity="warning">
                {t("settings.Devices.arpUnavailable")}
              </B4Alert>
            )}
          </>
        )}
      </Grid>
    </B4Section>
  );
};
