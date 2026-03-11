import {
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  DialogContent,
  DialogContentText,
  Fade,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  ApiIcon,
  CaptureIcon,
  CoreIcon,
  DiscoveryIcon,
  DomainIcon,
  RefreshIcon,
  SaveIcon,
  WarningIcon,
} from "@b4.icons";
import { useSnackbar } from "@context/SnackbarProvider";
import { ApiSettings } from "./Api";
import { CaptureSettings } from "./Capture";
import { ControlSettings } from "./Control";
import { DevicesSettings } from "./Devices";
import { CheckerSettings } from "./Discovery";
import { FeatureSettings } from "./Feature";
import { GeoSettings } from "./Geo";
import { LoggingSettings } from "./Logging";
import { MSSClampingSettings } from "./MSSClamping";
import { QueueSettings } from "./Queue";
import { Socks5Settings } from "./Socks5";
import { WebServerSettings } from "./WebServer";

import { B4Alert, B4Dialog, B4Tab, B4Tabs } from "@b4.elements";
import { configApi } from "@b4.settings";
import { colors, spacing } from "@design";
import { B4Config, B4SetConfig } from "@models/config";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({
  children,
  value,
  index,
  ...other
}: Readonly<TabPanelProps>) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Fade in>{<Box sx={{ pt: 3 }}>{children}</Box>}</Fade>
      )}
    </div>
  );
}

enum TABS {
  GENERAL = 0,
  DOMAINS,
  DISCOVERY,
  API,
  CAPTURE,
}

// Settings categories with route paths
const SETTING_CATEGORIES = [
  {
    id: TABS.GENERAL,
    path: "general",
    label: "Core",
    icon: <CoreIcon />,
    description: "Global network and queue configuration",
    requiresRestart: true,
  },
  {
    id: TABS.DOMAINS,
    path: "domains",
    label: "Geodat Settings",
    icon: <DomainIcon />,
    description: "Global geodata configuration",
    requiresRestart: false,
  },
  {
    id: TABS.DISCOVERY,
    path: "discovery",
    label: "Discovery",
    icon: <DiscoveryIcon />,
    description: "DPI bypass domains testing",
    requiresRestart: false,
  },
  {
    id: TABS.API,
    path: "api",
    label: "API",
    icon: <ApiIcon />,
    description: "API settings for various services",
    requiresRestart: false,
  },
  {
    id: TABS.CAPTURE,
    path: "capture",
    label: "Capture",
    icon: <CaptureIcon />,
    description: "Capture real payloads from live traffic",
    requiresRestart: false,
  },
];

export function SettingsPage() {
  const { showError, showSuccess } = useSnackbar();
  const [config, setConfig] = useState<B4Config | null>(null);
  const [originalConfig, setOriginalConfig] = useState<B4Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Determine current tab based on URL
  const currentTabPath = location.pathname.split("/settings/")[1] || "general";
  const currentTab =
    SETTING_CATEGORIES.find((cat) => cat.path === currentTabPath)?.id ??
    TABS.GENERAL;

  // Handle tab change
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    const category = SETTING_CATEGORIES.find(
      (cat) => cat.id === (newValue as TABS),
    );
    if (category) {
      navigate(`/settings/${category.path}`)?.catch(() => {});
    }
  };

  // Navigate to default tab if no specific tab is in URL
  useEffect(() => {
    if (
      location.pathname === "/settings" ||
      location.pathname === "/settings/"
    ) {
      navigate("/settings/general", { replace: true })?.catch(() => {});
    }
  }, [location.pathname, navigate]);

  // Check if configuration has been modified
  const hasChanges = useMemo(() => {
    if (!config || !originalConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  }, [config, originalConfig]);

  // Check which categories have changes
  const categoryHasChanges = useMemo(() => {
    if (!hasChanges || !config || !originalConfig) return {};

    return {
      // Core
      [TABS.GENERAL]:
        JSON.stringify(config.system.logging) !==
          JSON.stringify(originalConfig.system.logging) ||
        JSON.stringify(config.queue) !== JSON.stringify(originalConfig.queue) ||
        JSON.stringify(config.system.web_server) !==
          JSON.stringify(originalConfig.system.web_server) ||
        JSON.stringify(config.system.socks5) !==
          JSON.stringify(originalConfig.system.socks5) ||
        JSON.stringify(config.system.tables) !==
          JSON.stringify(originalConfig.system.tables) ||
        JSON.stringify(config.queue.devices) !==
          JSON.stringify(originalConfig.queue.devices),

      // Geosite Settings
      [TABS.DOMAINS]:
        JSON.stringify(config.system.geo) !==
        JSON.stringify(originalConfig.system.geo),

      // Discovery
      [TABS.DISCOVERY]:
        JSON.stringify(config.system.checker) !==
        JSON.stringify(originalConfig.system.checker),

      // API
      [TABS.API]:
        JSON.stringify(config.system.api) !==
        JSON.stringify(originalConfig.system.api),

      // Capture
      [TABS.CAPTURE]: false,
    };
  }, [config, originalConfig, hasChanges]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await configApi.get();
      setConfig(data);
      setOriginalConfig(structuredClone(data));
    } catch (error) {
      console.error("Error loading configuration:", error);
      showError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadConfig().catch(() => {});
  }, [loadConfig]);

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await configApi.save(config);
      setOriginalConfig(structuredClone(config));

      const requiresRestart = categoryHasChanges[0];
      showSuccess(
        requiresRestart
          ? "Configuration saved! Please restart B4 for core settings to take effect."
          : "Configuration saved successfully!",
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
      await loadConfig();
    }
  };

  const resetChanges = () => {
    if (originalConfig) {
      setConfig(structuredClone(originalConfig));
      setShowResetDialog(false);
      showSuccess("Changes discarded");
    }
  };

  const handleChange = (
    field: string,
    value:
      | string
      | number
      | boolean
      | string[]
      | B4SetConfig[]
      | null
      | undefined,
  ) => {
    if (!config) return;

    const keys = field.split(".");

    if (keys.length === 1) {
      setConfig({ ...config, [field]: value });
    } else {
      const newConfig = { ...config };
      let current: Record<string, unknown> = newConfig;

      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...(current[keys[i]] as object) };
        current = current[keys[i]] as Record<string, unknown>;
      }

      current[keys.at(-1)!] = value;
      setConfig(newConfig);
    }
  };

  if (loading || !config) {
    return (
      <Backdrop open sx={{ zIndex: 9999 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress sx={{ color: colors.secondary }} />
          <Typography sx={{ color: colors.text.primary }}>
            Loading configuration...
          </Typography>
        </Stack>
      </Backdrop>
    );
  }

  const validTab = Math.max(currentTab, 0);

  return (
    <Container
      maxWidth={false}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        py: 3,
      }}
    >
      {/* Header with tabs */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: colors.background.paper,
          borderRadius: 2,
          border: `1px solid ${colors.border.default}`,
        }}
      >
        <Box sx={{ p: 2, pb: 0 }}>
          {/* Action bar */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h6" sx={{ color: colors.text.primary }}>
                Configuration
              </Typography>
              {hasChanges && (
                <Chip
                  label="Modified"
                  size="small"
                  icon={<WarningIcon />}
                  sx={{
                    bgcolor: colors.accent.secondary,
                    color: colors.secondary,
                  }}
                />
              )}
            </Stack>

            <Stack direction="row" spacing={1}>
              {categoryHasChanges[TABS.GENERAL] && (
                <B4Alert severity="warning" sx={{ py: 0, px: spacing.sm }}>
                  Core settings require <strong>B4</strong> restart to take
                  effect
                </B4Alert>
              )}
              <Button
                size="small"
                variant="text"
                onClick={() => setShowResetDialog(true)}
                disabled={!hasChanges || saving}
              >
                Discard Changes
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  loadConfig().catch(() => {});
                }}
                disabled={saving}
              >
                Reload
              </Button>

              <Button
                size="small"
                variant="contained"
                startIcon={
                  saving ? <CircularProgress size={16} /> : <SaveIcon />
                }
                onClick={() => {
                  void saveConfig();
                }}
                disabled={!hasChanges || saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </Stack>
          </Stack>

          {/* Tabs */}
          <B4Tabs value={validTab} onChange={handleTabChange}>
            {[...SETTING_CATEGORIES].sort((a, b) => a.id - b.id).map((cat) => (
              <B4Tab
                key={cat.id}
                icon={cat.icon}
                label={cat.label}
                inline
                hasChanges={categoryHasChanges[cat.id]}
              />
            ))}
          </B4Tabs>
        </Box>
      </Paper>

      <Box sx={{ flex: 1, overflow: "auto", pb: 2 }}>
        <TabPanel value={validTab} index={TABS.GENERAL}>
          <Grid container spacing={spacing.lg} alignItems="stretch">
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <ControlSettings loadConfig={() => { loadConfig().catch(() => {}); }} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <LoggingSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <QueueSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <FeatureSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <WebServerSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <Socks5Settings config={config} onChange={handleChange} />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <MSSClampingSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
              <Box sx={{ width: "100%" }}>
                <DevicesSettings config={config} onChange={handleChange} />
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={validTab} index={TABS.DOMAINS}>
          <GeoSettings
            config={config}
            loadConfig={() => {
              loadConfig().catch(() => {});
            }}
          />
        </TabPanel>

        <TabPanel value={validTab} index={TABS.API}>
          <ApiSettings config={config} onChange={handleChange} />
        </TabPanel>

        <TabPanel value={validTab} index={TABS.DISCOVERY}>
          <CheckerSettings config={config} onChange={handleChange} />
        </TabPanel>

        <TabPanel value={validTab} index={TABS.CAPTURE}>
          <CaptureSettings />
        </TabPanel>
      </Box>

      {/* Reset Confirmation Dialog */}
      <B4Dialog
        title="Discard changes"
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        actions={
          <>
            <Button onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={resetChanges} variant="contained">
              Discard Changes
            </Button>
          </>
        }
      >
        <DialogContent>
          <DialogContentText>
            Are you sure you want to discard all unsaved changes? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
      </B4Dialog>
    </Container>
  );
}
