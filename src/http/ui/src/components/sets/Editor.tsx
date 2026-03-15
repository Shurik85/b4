import {
  Box,
  Button,
  CircularProgress,
  Fade,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import {
  DnsIcon,
  DomainIcon,
  ImportExportIcon,
  SaveIcon,
  TcpIcon,
  UdpIcon,
} from "@b4.icons";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AltRouteIcon from "@mui/icons-material/AltRoute";

import { B4Tab, B4Tabs, B4TextField } from "@b4.elements";

import { colors } from "@design";
import {
  B4Config,
  B4SetConfig,
  SystemConfig,
} from "@models/config";

import { DnsSettings } from "./Dns";
import { ImportExportSettings } from "./ImportExport";
import { SetStats } from "./Manager";
import { RoutingSettings } from "./Routing";
import { TargetSettings } from "./Target";
import { TcpTabContainer } from "./tcp/TcpTabContainer";
import { UdpSettings } from "./Udp";
import { useTranslation } from "react-i18next";

interface TabPanelProps {
  children?: ReactNode;
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
      id={`set-tabpanel-${index}`}
      aria-labelledby={`set-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Fade in>
          <Box sx={{ pt: 3 }}>{children}</Box>
        </Fade>
      )}
    </div>
  );
}

export interface SetEditorPageProps {
  settings: SystemConfig;
  set: B4SetConfig;
  config: B4Config;
  stats?: SetStats;
  otherSetsTargets?: Map<string, string[]>;
  isNew: boolean;
  saving: boolean;
  onSave: (set: B4SetConfig) => void;
}

export const SetEditorPage = ({
  set: initialSet,
  config,
  isNew,
  settings,
  stats,
  otherSetsTargets,
  saving,
  onSave,
}: SetEditorPageProps) => {
  enum TABS {
    TARGETS = 0,
    TCP,
    UDP,
    DNS,
    ROUTING,
    IMPORT_EXPORT,
  }

  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TABS>(TABS.TARGETS);
  const [editedSet, setEditedSet] = useState<B4SetConfig | null>(initialSet);

  const prevSetId = useRef(initialSet.id);
  useEffect(() => {
    setEditedSet(initialSet);
    if (prevSetId.current !== initialSet.id) {
      setActiveTab(0);
      prevSetId.current = initialSet.id;
    }
  }, [initialSet]);

  const handleChange = (
    field: string,
    value: string | number | boolean | string[] | number[] | null | undefined,
  ) => {
    setEditedSet((prev) => {
      if (!prev) return prev;

      const keys = field.split(".");

      if (keys.length === 1) {
        return { ...prev, [field]: value };
      }

      const newConfig = { ...prev };
      let current: Record<string, unknown> = newConfig;

      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...(current[keys[i]] as object) };
        current = current[keys[i]] as Record<string, unknown>;
      }

      current[keys.at(-1)!] = value;
      return newConfig;
    });
  };

  const handleSave = () => {
    if (editedSet) {
      onSave(editedSet);
    }
  };

  const handleApplyImport = (importedSet: B4SetConfig) => {
    setEditedSet(importedSet);
  };

  const handleBack = () => {
    navigate("/sets")?.catch(() => {});
  };

  if (!editedSet) return null;

  return (
    <>
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
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={handleBack}
                size="small"
              >
                {t("core.back")}
              </Button>
              <B4TextField
                value={editedSet.name}
                onChange={(e) => {
                  handleChange("name", e.target.value);
                }}
                placeholder={t("sets.editor.namePlaceholder")}
                required
                size="small"
                sx={{
                  minWidth: 250,
                  "& .MuiInputBase-input": {
                    fontSize: "1.1rem",
                    fontWeight: 600,
                  },
                }}
              />
              {isNew && (
                <Typography
                  variant="caption"
                  sx={{
                    color: colors.secondary,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("sets.editor.newSet")}
                </Typography>
              )}
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleBack}
                disabled={saving}
              >
                {t("core.cancel")}
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={
                  saving ? <CircularProgress size={16} /> : <SaveIcon />
                }
                onClick={handleSave}
                disabled={!editedSet.name.trim() || saving}
                sx={{ minWidth: 140 }}
              >
                {saving && t("core.saving")}
                {!saving && isNew && t("sets.editor.createSet")}
                {!saving && !isNew && t("core.save")}
              </Button>
            </Stack>
          </Stack>

          {/* Tabs */}
          <B4Tabs
            value={activeTab}
            onChange={(_, v: number) => {
              setActiveTab(v);
            }}
          >
            <B4Tab icon={<DomainIcon />} label={t("sets.editor.tabs.targets")} inline />
            <B4Tab icon={<TcpIcon />} label={t("sets.editor.tabs.tcp")} inline />
            <B4Tab icon={<UdpIcon />} label={t("sets.editor.tabs.udp")} inline />
            <B4Tab icon={<DnsIcon />} label={t("sets.editor.tabs.dns")} inline />
            <B4Tab icon={<AltRouteIcon />} label={t("sets.editor.tabs.routing")} inline />
            <B4Tab icon={<ImportExportIcon />} label={t("sets.editor.tabs.importExport")} inline />
          </B4Tabs>
        </Box>
      </Paper>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: "auto", pb: 2 }}>
        <TabPanel value={activeTab} index={TABS.TARGETS}>
          <TargetSettings
            geo={settings.geo}
            config={editedSet}
            stats={stats}
            otherSetsTargets={otherSetsTargets}
            onChange={handleChange}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TABS.TCP}>
          <TcpTabContainer
            config={editedSet}
            queue={config.queue}
            onChange={handleChange}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TABS.UDP}>
          <UdpSettings
            config={editedSet}
            queue={config.queue}
            onChange={handleChange}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TABS.DNS}>
          <DnsSettings
            config={editedSet}
            onChange={handleChange}
            ipv6={config.queue.ipv6}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TABS.ROUTING}>
          <RoutingSettings
            set={editedSet}
            availableIfaces={config.available_ifaces ?? []}
            onChange={handleChange}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TABS.IMPORT_EXPORT}>
          <ImportExportSettings
            config={editedSet}
            onImport={handleApplyImport}
          />
        </TabPanel>
      </Box>
    </>
  );
};
