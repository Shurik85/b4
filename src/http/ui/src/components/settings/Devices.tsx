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

const DeviceNameCell = ({
  device,
  isSelected,
  isEditing,
  onStartEdit,
  onSaveAlias,
  onResetAlias,
  onCancelEdit,
}: {
  device: DeviceInfo;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveAlias: (alias: string) => Promise<void>;
  onResetAlias: () => Promise<void>;
  onCancelEdit: () => void;
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
          Unknown
        </Typography>
      )}
      <Tooltip title="Edit name">
        <IconButton
          size="small"
          onClick={onStartEdit}
          sx={{ opacity: 0.6, "&:hover": { opacity: 1 } }}
        >
          <EditIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {device.alias && (
        <Tooltip title="Reset to vendor name">
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
    } else {
      if (idx !== -1) {
        current[idx] = { ...current[idx], size };
      } else {
        current.push({ mac: mac.toUpperCase(), size });
      }
    }
    onChange("queue.devices.mss_clamps", current);
  };

  const isSelected = (mac: string) => selectedMacs.includes(mac);
  const allSelected =
    devices.length > 0 && selectedMacs.length === devices.length;
  const someSelected =
    selectedMacs.length > 0 && selectedMacs.length < devices.length;

  return (
    <B4Section
      title="Device Filtering"
      description="Filter traffic by source device MAC address"
      icon={<DeviceUnknowIcon />}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
            <B4Switch
              label="Enable Device Filtering"
              checked={enabled}
              onChange={(checked) => onChange("queue.devices.enabled", checked)}
              description="Only process traffic from selected devices"
            />
            <B4Switch
              label="Vendor Lookup"
              checked={vendorLookup}
              onChange={(checked) => onChange("queue.devices.vendor_lookup", checked)}
              description="Download vendor database to identify device manufacturers (~6MB)"
            />
            <B4Switch
              label="Invert Selection (Blacklist)"
              checked={wisb}
              onChange={(checked) => onChange("queue.devices.wisb", checked)}
              description={
                wisb ? "Block selected devices" : "Allow only selected devices"
              }
              disabled={!enabled}
            />
          </Box>
        </Grid>

        {enabled && (
          <>
            <B4Alert severity={wisb ? "warning" : "info"}>
              {wisb
                ? "Blacklist mode: Selected devices will be EXCLUDED from DPI bypass"
                : "Whitelist mode: Only selected devices will use DPI bypass"}
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
                    Available Devices
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
                    title="Refresh devices"
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
                        {["MAC Address", "IP", "Name", "MSS"].map((label) => (
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
                              ? "Loading devices..."
                              : "No devices found"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...devices]
                          .sort((a, b) => {
                            const aSelected = isSelected(a.mac);
                            const bSelected = isSelected(b.mac);
                            if (aSelected !== bSelected) return aSelected ? -1 : 1;
                            const aName = (a.alias || a.vendor || a.hostname || "").toLowerCase();
                            const bName = (b.alias || b.vendor || b.hostname || "").toLowerCase();
                            return aName.localeCompare(bName);
                          })
                          .map((device) => (
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
                ARP table not available. Device discovery unavailable.
              </B4Alert>
            )}
          </>
        )}
      </Grid>
    </B4Section>
  );
};
