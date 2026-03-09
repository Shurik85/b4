import { useState, useEffect, useRef, useCallback } from "react";
import {
  Grid,
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Tooltip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  CircularProgress,
} from "@mui/material";
import {
  DomainIcon,
  CategoryIcon,
  InfoIcon,
  ClearIcon,
  IpIcon,
  DeviceIcon,
  RefreshIcon,
} from "@b4.icons";

import {
  B4TextField,
  B4Section,
  B4Dialog,
  B4Alert,
  B4Tabs,
  B4Tab,
  B4ChipList,
  B4PlusButton,
  B4Badge,
  B4TooltipButton,
} from "@b4.elements";
import SettingAutocomplete from "@common/B4Autocomplete";
import { B4SetConfig, GeoConfig, TargetsConfig } from "@models/config";

export type OtherSetsTargets = Map<string, string[]>;
import { useDevices } from "@b4.devices";
import { colors } from "@design";
import { SetStats } from "./Manager";
import { sortDevices } from "@utils";

interface TargetSettingsProps {
  config: B4SetConfig;
  geo: GeoConfig;
  stats?: SetStats;
  otherSetsTargets?: OtherSetsTargets;
  onChange: (field: string, value: string | string[]) => void;
}

interface CategoryPreview {
  category: string;
  total_domains: number;
  preview_count: number;
  preview: string[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: Readonly<TabPanelProps>) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`domain-tabpanel-${index}`}
      aria-labelledby={`domain-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const TargetSettings = ({
  config,
  onChange,
  geo,
  stats,
  otherSetsTargets,
}: TargetSettingsProps) => {
  const [tabValue, setTabValue] = useState(0);
  const {
    devices,
    loading: devicesLoading,
    available: devicesAvailable,
    loadDevices,
  } = useDevices();
  const [newBypassDomain, setNewBypassDomain] = useState("");
  const [domainDuplicateWarning, setDomainDuplicateWarning] = useState("");
  const [newBypassIP, setNewBypassIP] = useState("");
  const [ipDuplicateWarning, setIpDuplicateWarning] = useState("");
  const [newBypassCategory, setNewBypassCategory] = useState("");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [newBypassGeoIPCategory, setNewBypassGeoIPCategory] = useState("");
  const [availableGeoIPCategories, setAvailableGeoIPCategories] = useState<
    string[]
  >([]);
  const [loadingGeoIPCategories, setLoadingGeoIPCategories] = useState(false);

  const [previewDialog, setPreviewDialog] = useState<{
    open: boolean;
    category: string;
    data?: CategoryPreview;
    loading: boolean;
  }>({ open: false, category: "", loading: false });

  useEffect(() => {
    if (geo.sitedat_path) {
      void loadCategories("/api/geosite", setAvailableCategories, setLoadingCategories);
    }
    if (geo.ipdat_path) {
      void loadCategories("/api/geoip", setAvailableGeoIPCategories, setLoadingGeoIPCategories);
    }
  }, [geo.sitedat_path, geo.ipdat_path]);

  useEffect(() => {
    loadDevices().catch(() => {});
  }, [loadDevices]);

  const loadCategories = async (
    endpoint: string,
    setItems: (items: string[]) => void,
    setLoading: (loading: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = (await response.json()) as { tags: string[] };
        setItems(data.tags || []);
      }
    } catch (error) {
      console.error(`Failed to load categories from ${endpoint}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const domainCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ipCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const checkDomainBackend = useCallback(
    (domain: string) => {
      fetch(
        `/api/sets/check-domain?domain=${encodeURIComponent(domain)}&exclude=${encodeURIComponent(config.id)}`,
      )
        .then((res) => res.json())
        .then((matches: { set_name: string; via: string }[]) => {
          if (matches.length > 0) {
            const msg = matches
              .map((m) => `"${domain}" is in ${m.set_name} (${m.via})`)
              .join("; ");
            setDomainDuplicateWarning(msg);
          }
        })
        .catch(() => {});
    },
    [config.id],
  );

  const checkDomainDuplicates = (input: string) => {
    if (!input.trim()) {
      setDomainDuplicateWarning("");
      clearTimeout(domainCheckTimer.current);
      return;
    }
    const domains = input.split(/[\s,|]+/).filter(Boolean);
    // Instant client-side check against manual domains in other sets
    if (otherSetsTargets) {
      const found: string[] = [];
      for (const raw of domains) {
        const sets = otherSetsTargets.get(raw.trim().toLowerCase());
        if (sets) found.push(`"${raw.trim()}" is in ${sets.join(", ")}`);
      }
      if (found.length > 0) {
        setDomainDuplicateWarning(found.join("; "));
      }
    }
    // Always run debounced backend check (catches geosite matches too)
    clearTimeout(domainCheckTimer.current);
    if (domains.length === 1) {
      domainCheckTimer.current = setTimeout(
        () => checkDomainBackend(domains[0].trim()),
        400,
      );
    }
  };

  const checkIpDuplicates = (input: string) => {
    if (!otherSetsTargets || !input.trim()) {
      setIpDuplicateWarning("");
      clearTimeout(ipCheckTimer.current);
      return;
    }
    const ips = input.split(/[\s,|]+/).filter(Boolean);
    const found: string[] = [];
    for (const raw of ips) {
      const sets = otherSetsTargets.get(raw.trim());
      if (sets) found.push(`"${raw.trim()}" is in ${sets.join(", ")}`);
    }
    setIpDuplicateWarning(found.join("; "));
  };

  const handleAddBypassDomain = () => {
    const value = newBypassDomain.trim();
    if (!value) return;

    const domainRange = value.split(/[\s,|]+/).filter(Boolean);
    const existing = new Set(config.targets.sni_domains);
    const next = [...config.targets.sni_domains];

    for (const raw of domainRange) {
      const domain = raw.trim();
      if (domain && !existing.has(domain)) {
        existing.add(domain);
        next.push(domain);
      }
    }

    onChange("targets.sni_domains", next);
    setNewBypassDomain("");
    setDomainDuplicateWarning("");
  };

  const handleAddBypassIP = () => {
    const value = newBypassIP.trim();
    if (!value) return;

    const ipRange = value.split(/[\s,|]+/).filter(Boolean);
    const existing = new Set(config.targets.ip);
    const next = [...config.targets.ip];

    for (const raw of ipRange) {
      const ip = raw.trim();
      if (ip && !existing.has(ip)) {
        existing.add(ip);
        next.push(ip);
      }
    }

    onChange("targets.ip", next);
    setNewBypassIP("");
    setIpDuplicateWarning("");
  };

  const handleClearAll = (field: string) => {
    onChange(field, []);
  };

  const handleRemove = (field: keyof TargetsConfig, value: string) => {
    const items = config.targets[field] ?? [];
    onChange(`targets.${String(field)}`, items.filter((item) => item !== value));
  };

  const handleAddBypassGeoIPCategory = (category: string) => {
    if (category && !config.targets.geoip_categories.includes(category)) {
      onChange("targets.geoip_categories", [
        ...config.targets.geoip_categories,
        category,
      ]);
      setNewBypassGeoIPCategory("");
    }
  };

  const handleAddBypassCategory = (category: string) => {
    if (category && !config.targets.geosite_categories.includes(category)) {
      onChange("targets.geosite_categories", [
        ...config.targets.geosite_categories,
        category,
      ]);
      setNewBypassCategory("");
    }
  };

  const previewCategory = async (category: string) => {
    setPreviewDialog({ open: true, category, loading: true });
    try {
      const response = await fetch(
        `/api/geosite/category?tag=${encodeURIComponent(category)}`,
      );
      if (response.ok) {
        const data = (await response.json()) as CategoryPreview;
        setPreviewDialog((prev) => ({ ...prev, data, loading: false }));
      }
    } catch (error) {
      console.error("Failed to preview category:", error);
      setPreviewDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const renderCategoryLabel = (
    category: string,
    breakdown?: Record<string, number>,
  ) => {
    const count = breakdown?.[category];
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <span>{category}</span>
        {count && (
          <Typography
            component="span"
            variant="caption"
            sx={{
              bgcolor: "action.selected",
              px: 0.5,
              borderRadius: 1,
              fontWeight: 600,
            }}
          >
            {count}
          </Typography>
        )}
      </Box>
    );
  };

  const selectedSourceDevices: string[] = config.targets.source_devices ?? [];

  const handleSourceDeviceToggle = (mac: string) => {
    const current = [...selectedSourceDevices];
    const index = current.indexOf(mac);
    if (index === -1) {
      current.push(mac);
    } else {
      current.splice(index, 1);
    }
    onChange("targets.source_devices", current);
  };

  const isSourceDeviceSelected = (mac: string) =>
    selectedSourceDevices.includes(mac);

  return (
    <>
      <Stack spacing={3}>
        <B4Section
          title="Domain Filtering Configuration"
          description="Configure domain matching for DPI bypass and blocking"
          icon={<DomainIcon />}
        >
          <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 0 }}>
            <B4Tabs
              value={tabValue}
              onChange={(_, newValue: number) => setTabValue(newValue)}
            >
              <B4Tab icon={<DomainIcon />} label="Bypass Domains" inline />
              <B4Tab icon={<IpIcon />} label="Bypass IPs" inline />
              <B4Tab
                icon={<DeviceIcon />}
                label={
                  selectedSourceDevices.length > 0
                    ? `Source Devices (${selectedSourceDevices.length})`
                    : "Source Devices"
                }
                inline
              />
            </B4Tabs>
          </Box>

          {/* DPI Bypass Tab */}
          <TabPanel value={tabValue} index={0}>
            <B4Alert severity="info" sx={{ m: 0 }}>
              Domains in this list will use DPI bypass techniques
              (fragmentation, faking) when matched.
            </B4Alert>

            <Grid container spacing={2}>
              {/* Manual Bypass Domains */}
              <Grid size={{ sm: 12, md: 6 }}>
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 2,
                    }}
                  >
                    <DomainIcon /> Manual Bypass Domains
                    <Tooltip title="Add specific domains to bypass DPI.">
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Typography>
                  <Box
                    sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                  >
                    <B4TextField
                      label="Add Bypass Domain"
                      value={newBypassDomain}
                      onChange={(e) => {
                        setNewBypassDomain(e.target.value);
                        checkDomainDuplicates(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === ","
                        ) {
                          e.preventDefault();
                          handleAddBypassDomain();
                        }
                      }}
                      helperText="e.g., youtube.com, google.com"
                      placeholder="example.com"
                    />
                    <B4PlusButton
                      onClick={handleAddBypassDomain}
                      disabled={!newBypassDomain.trim()}
                    />
                  </Box>
                  {domainDuplicateWarning && (
                    <B4Alert severity="warning" sx={{ mt: 1 }}>
                      Already exists in other sets: {domainDuplicateWarning}
                    </B4Alert>
                  )}
                  <Box sx={{ mt: 2 }}>
                    {config.targets.sni_domains.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 1,
                        }}
                      >
                        <Typography variant="subtitle2">
                          Active manually added domains
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => handleClearAll("targets.sni_domains")}
                          startIcon={<ClearIcon />}
                        >
                          Clear All
                        </Button>
                      </Box>
                    )}
                    <B4ChipList
                      items={config.targets.sni_domains}
                      getKey={(d) => d}
                      getLabel={(d) => d}
                      onDelete={(d) => handleRemove("sni_domains", d)}
                      emptyMessage="No bypass domains added"
                      showEmpty
                    />
                  </Box>
                </Box>
              </Grid>

              {/* GeoSite Categories */}
              {geo.sitedat_path && availableCategories.length > 0 && (
                <Grid size={{ sm: 12, md: 6 }}>
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 2,
                      }}
                    >
                      <CategoryIcon /> Bypass GeoSite Categories
                      <Tooltip title="Load predefined domain lists from GeoSite database for DPI bypass">
                        <InfoIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Typography>

                    <SettingAutocomplete
                      label="Add Bypass Category"
                      value={newBypassCategory}
                      options={availableCategories}
                      onChange={setNewBypassCategory}
                      onSelect={handleAddBypassCategory}
                      loading={loadingCategories}
                      placeholder="Select or type category"
                      helperText={`${availableCategories.length} categories available`}
                    />

                    <Box sx={{ mt: 2 }}>
                      {config.targets.geosite_categories.length > 0 && (
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 1,
                          }}
                        >
                          <Typography variant="subtitle2">
                            Active Bypass Categories
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => handleClearAll("targets.geosite_categories")}
                            startIcon={<ClearIcon />}
                          >
                            Clear All
                          </Button>
                        </Box>
                      )}
                      <B4ChipList
                        items={config.targets.geosite_categories}
                        getKey={(c) => c}
                        getLabel={(c) =>
                          renderCategoryLabel(
                            c,
                            stats?.geosite_category_breakdown,
                          )
                        }
                        onDelete={(c) => handleRemove("geosite_categories", c)}
                        onClick={(c) => void previewCategory(c)}
                      />
                    </Box>
                  </Box>
                </Grid>
              )}
            </Grid>
          </TabPanel>

          {/* Bypass IPs Tab */}
          <TabPanel value={tabValue} index={1}>
            <B4Alert>
              IP ranges in these categories will use DPI bypass techniques
              (fragmentation, faking) when matched.
            </B4Alert>

            <Grid container spacing={2}>
              {/* Manual Bypass IPs */}
              <Grid size={{ sm: 12, md: 6 }}>
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 2,
                    }}
                  >
                    <IpIcon /> Manual Bypass IPs
                    <Tooltip title="Add specific ip/cidr to bypass DPI.">
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Typography>
                  <Box
                    sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                  >
                    <B4TextField
                      label="Add Bypass IP/CIDR"
                      value={newBypassIP}
                      onChange={(e) => {
                        setNewBypassIP(e.target.value);
                        checkIpDuplicates(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "Tab" ||
                          e.key === ","
                        ) {
                          e.preventDefault();
                          handleAddBypassIP();
                        }
                      }}
                      helperText="e.g. 192.168.1.1, 10.0.0.0/8"
                      placeholder="192.168.1.1"
                    />
                    <B4PlusButton
                      onClick={handleAddBypassIP}
                      disabled={!newBypassIP}
                    />
                  </Box>
                  {ipDuplicateWarning && (
                    <B4Alert severity="warning" sx={{ mt: 1 }}>
                      Already exists in other sets: {ipDuplicateWarning}
                    </B4Alert>
                  )}
                  <Box sx={{ mt: 2 }}>
                    {config.targets.ip.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 1,
                        }}
                      >
                        <Typography variant="subtitle2">
                          Active manually added IPs
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => handleClearAll("targets.ip")}
                          startIcon={<ClearIcon />}
                        >
                          Clear All
                        </Button>
                      </Box>
                    )}
                    <B4ChipList
                      items={config.targets.ip}
                      getKey={(ip) => ip}
                      getLabel={(ip) => ip}
                      onDelete={(ip) => handleRemove("ip", ip)}
                      emptyMessage="No bypass ip added"
                      showEmpty
                      maxHeight={200}
                    />
                  </Box>
                </Box>
              </Grid>

              {/* GeoIP Categories */}
              {geo.ipdat_path && availableGeoIPCategories.length > 0 && (
                <Grid size={{ sm: 12, md: 6 }}>
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 2,
                      }}
                    >
                      <CategoryIcon /> Bypass GeoIP Categories
                      <Tooltip title="Load predefined IP lists from GeoIP database for DPI bypass">
                        <InfoIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Typography>

                    <SettingAutocomplete
                      label="Add Bypass GeoIP Category"
                      value={newBypassGeoIPCategory}
                      options={availableGeoIPCategories}
                      onChange={setNewBypassGeoIPCategory}
                      onSelect={handleAddBypassGeoIPCategory}
                      loading={loadingGeoIPCategories}
                      placeholder="Select or type GeoIP category"
                      helperText={`${availableGeoIPCategories.length} GeoIP categories available`}
                    />

                    <Box sx={{ mt: 2 }}>
                      {config.targets.geoip_categories.length > 0 && (
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 1,
                          }}
                        >
                          <Typography variant="subtitle2">
                            Active Bypass GeoIP Categories
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => handleClearAll("targets.geoip_categories")}
                            startIcon={<ClearIcon />}
                          >
                            Clear All
                          </Button>
                        </Box>
                      )}
                      <B4ChipList
                        items={config.targets.geoip_categories}
                        getKey={(c) => c}
                        getLabel={(c) =>
                          renderCategoryLabel(
                            c,
                            stats?.geoip_category_breakdown,
                          )
                        }
                        onDelete={(c) => handleRemove("geoip_categories", c)}
                      />
                    </Box>
                  </Box>
                </Grid>
              )}
            </Grid>
          </TabPanel>

          {/* Source Devices Tab */}
          <TabPanel value={tabValue} index={2}>
            <B4Alert severity="info">
              Restrict this set to specific source devices. When devices are
              selected, this set will only apply to traffic from those devices.
              Device-specific sets take priority over general sets.
            </B4Alert>

            {devicesAvailable ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                      mt: 2,
                    }}
                  >
                    <Typography variant="subtitle2">
                      Available Devices
                      {selectedSourceDevices.length > 0 && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ ml: 1, color: colors.secondary }}
                        >
                          ({selectedSourceDevices.length} selected)
                        </Typography>
                      )}
                    </Typography>
                    <B4TooltipButton
                      title="Refresh devices"
                      icon={
                        devicesLoading ? (
                          <CircularProgress size={18} />
                        ) : (
                          <RefreshIcon />
                        )
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
                      maxHeight: 350,
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
                              indeterminate={
                                selectedSourceDevices.length > 0 &&
                                selectedSourceDevices.length < devices.length
                              }
                              checked={
                                devices.length > 0 &&
                                selectedSourceDevices.length === devices.length
                              }
                              onChange={(e) =>
                                onChange(
                                  "targets.source_devices",
                                  e.target.checked
                                    ? devices.map((d) => d.mac)
                                    : [],
                                )
                              }
                            />
                          </TableCell>
                          {["MAC Address", "IP", "Name"].map((label) => (
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
                            <TableCell colSpan={4} align="center">
                              {devicesLoading
                                ? "Loading devices..."
                                : "No devices found"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortDevices(devices, isSourceDeviceSelected)
                            .map((device) => (
                            <TableRow
                              key={device.mac}
                              hover
                              onClick={() =>
                                handleSourceDeviceToggle(device.mac)
                              }
                              sx={{ cursor: "pointer" }}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={isSourceDeviceSelected(device.mac)}
                                  color="secondary"
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    handleSourceDeviceToggle(device.mac);
                                  }}
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
                              <TableCell>
                                <B4Badge
                                  label={
                                    device.alias ||
                                    device.vendor ||
                                    device.hostname ||
                                    "Unknown"
                                  }
                                  color="primary"
                                  variant={
                                    isSourceDeviceSelected(device.mac)
                                      ? "filled"
                                      : "outlined"
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {selectedSourceDevices.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        onClick={() => handleClearAll("targets.source_devices")}
                        startIcon={<ClearIcon />}
                      >
                        Clear All
                      </Button>
                    </Box>
                  )}
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ mt: 2 }}>
                <B4Alert severity="warning">
                  ARP table not available. Device discovery is unavailable.
                  Source device filtering requires a working ARP table.
                </B4Alert>
              </Box>
            )}
          </TabPanel>
        </B4Section>
      </Stack>

      {/* Preview Dialog */}
      <B4Dialog
        title={`${previewDialog.category.toUpperCase()}`}
        subtitle="Category Preview"
        icon={<CategoryIcon />}
        open={previewDialog.open}
        onClose={() =>
          setPreviewDialog({ open: false, category: "", loading: false })
        }
        actions={
          <Button
            variant="contained"
            onClick={() =>
              setPreviewDialog({ open: false, category: "", loading: false })
            }
          >
            Close
          </Button>
        }
      >
        {previewDialog.loading ? (
          <Box sx={{ p: 2 }}>
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </Box>
        ) : previewDialog.data ? (
          <>
            <B4Alert severity="info" sx={{ mb: 2 }}>
              Total domains in category: {previewDialog.data.total_domains}
              {previewDialog.data.total_domains >
                previewDialog.data.preview_count &&
                ` (showing first ${previewDialog.data.preview_count})`}
            </B4Alert>
            <List dense sx={{ maxHeight: 600, overflow: "auto" }}>
              {previewDialog.data.preview.map((domain) => (
                <ListItem key={domain}>
                  <ListItemText primary={domain} />
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <B4Alert severity="error">Failed to load category preview</B4Alert>
        )}
      </B4Dialog>
    </>
  );
};
