import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  IconButton,
  Collapse,
  Tooltip,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AddCircleOutline as AddIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import { colors } from "@design";
import { formatNumber } from "@utils";
import { B4SetConfig } from "@models/config";
import { setsApi } from "@b4.sets";
import { B4Badge } from "@b4.elements";
import { useTranslation } from "react-i18next";

interface DeviceInfo {
  mac: string;
  ip: string;
  hostname: string;
  vendor: string;
  alias?: string;
}

interface DeviceActivityProps {
  deviceDomains: Record<string, Record<string, number>>;
  domainTLS: Record<string, string>;
  sets: B4SetConfig[];
  targetedDomains: Set<string>;
  onRefreshSets: () => void;
}

export const DeviceActivity = ({
  deviceDomains,
  domainTLS,
  sets,
  targetedDomains,
  onRefreshSets,
}: DeviceActivityProps) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((data: { devices?: DeviceInfo[] }) => {
        if (data?.devices) setDevices(data.devices);
      })
      .catch(() => {});
  }, []);

  const isDomainTargeted = (domain: string): boolean => {
    if (targetedDomains.has(domain)) return true;
    const parts = domain.split(".");
    for (let i = 1; i < parts.length; i++) {
      if (targetedDomains.has(parts.slice(i).join("."))) return true;
    }
    return false;
  };

  const deviceMap = useMemo(() => {
    const map: Record<string, DeviceInfo> = {};
    for (const d of devices) {
      map[d.mac] = d;
    }
    return map;
  }, [devices]);

  // Sort devices by total domain count descending
  const sortedDevices = useMemo(() => {
    return Object.entries(deviceDomains)
      .map(([mac, domains]) => ({
        mac,
        domains,
        total: Object.values(domains).reduce((s, c) => s + c, 0),
        domainCount: Object.keys(domains).length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [deviceDomains]);

  const toggleExpand = (mac: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  };

  const getDeviceName = (mac: string): string => {
    const dev = deviceMap[mac];
    if (dev?.alias) return dev.alias;
    if (dev?.hostname) return dev.hostname;
    if (dev?.vendor && dev.vendor !== "Private")
      return `${dev.vendor} (${mac})`;
    return mac;
  };

  const getDeviceSubtitle = (mac: string): string => {
    const dev = deviceMap[mac];
    if (!dev) return "";
    const parts: string[] = [];
    if (dev.ip) parts.push(dev.ip);
    if (dev.vendor && dev.vendor !== "Private") parts.push(dev.vendor);
    return parts.join(" - ");
  };

  if (sortedDevices.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          color: colors.text.secondary,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: 1,
          display: "block",
        }}
      >
        {t("dashboard.deviceActivity.title")}
      </Typography>
      <Stack spacing={1}>
        {sortedDevices.map(({ mac, domains, total, domainCount }) => {
          const isExpanded = expanded.has(mac);
          const sortedDomains = Object.entries(domains).sort(
            (a, b) => b[1] - a[1],
          );

          return (
            <Paper
              key={mac}
              sx={{
                bgcolor: colors.background.paper,
                borderColor: colors.border.default,
                overflow: "hidden",
              }}
              variant="outlined"
            >
              {/* Collapsed header */}
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  "&:hover": { bgcolor: `${colors.primary}08` },
                }}
                onClick={() => toggleExpand(mac)}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ minWidth: 0 }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: colors.text.primary,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getDeviceName(mac)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: colors.text.disabled, flexShrink: 0 }}
                  >
                    {getDeviceSubtitle(mac)}
                  </Typography>
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexShrink: 0 }}
                >
                  <Chip
                    label={`${domainCount} ${t("core.domains")}`}
                    size="small"
                    sx={{
                      bgcolor: `${colors.secondary}15`,
                      color: colors.text.secondary,
                      fontSize: "0.7rem",
                      height: 22,
                    }}
                  />
                  <Chip
                    label={`${formatNumber(total)} ${t("dashboard.deviceActivity.conn")}`}
                    size="small"
                    sx={{
                      bgcolor: `${colors.primary}15`,
                      color: colors.text.secondary,
                      fontSize: "0.7rem",
                      height: 22,
                    }}
                  />
                  {isExpanded ? (
                    <ExpandLessIcon
                      sx={{ color: colors.text.secondary, fontSize: 20 }}
                    />
                  ) : (
                    <ExpandMoreIcon
                      sx={{ color: colors.text.secondary, fontSize: 20 }}
                    />
                  )}
                </Stack>
              </Box>

              {/* Expanded domain list */}
              <Collapse in={isExpanded}>
                <Box sx={{ px: 2, pb: 1.5 }}>
                  <Stack spacing={0.25}>
                    {sortedDomains.map(([domain, count]) => (
                      <DomainRow
                        key={domain}
                        domain={domain}
                        count={count}
                        tls={domainTLS[domain]}
                        isTargeted={isDomainTargeted(domain)}
                        sets={sets}
                        onAdded={onRefreshSets}
                      />
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

interface DomainRowProps {
  domain: string;
  count: number;
  tls?: string;
  isTargeted: boolean;
  sets: B4SetConfig[];
  onAdded: () => void;
}

const DomainRow = ({
  domain,
  count,
  tls,
  isTargeted,
  sets,
  onAdded,
}: DomainRowProps) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (setId: string) => {
    setAnchorEl(null);
    setAdding(true);
    try {
      await setsApi.addDomainToSet(setId, domain);
      onAdded();
    } catch (e) {
      console.error("Failed to add domain:", e);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 0.5,
        px: 1,
        borderRadius: 0.5,
        "&:hover": { bgcolor: `${colors.primary}06` },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ minWidth: 0, flex: 1 }}
      >
        {tls && <B4Badge label={tls} color="secondary" title={t("core.tlsVersion")} />}
        <Typography variant="overline">{domain}</Typography>
        <B4Badge label={formatNumber(count)} />
      </Stack>

      {isTargeted ? (
        <Tooltip title={t("dashboard.deviceActivity.alreadyInSet")}>
          <CheckIcon sx={{ color: "#4caf50", fontSize: 16, ml: 1 }} />
        </Tooltip>
      ) : (
        <>
          <Tooltip title={t("core.addToSet")}>
            <IconButton
              size="small"
              onClick={(e) => {
                setAnchorEl(e.currentTarget);
              }}
              disabled={adding}
              sx={{ color: colors.secondary, ml: 0.5, p: 0.25 }}
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => {
              setAnchorEl(null);
            }}
            slotProps={{
              paper: {
                sx: {
                  bgcolor: colors.background.default,
                  border: `1px solid ${colors.border.default}`,
                },
              },
            }}
          >
            {sets
              .filter((s) => s.enabled)
              .map((set) => (
                <MenuItem
                  key={set.id}
                  onClick={() => void handleAdd(set.id)}
                  sx={{ color: colors.text.primary, fontSize: "0.8rem" }}
                >
                  {set.name}
                </MenuItem>
              ))}
          </Menu>
        </>
      )}
    </Box>
  );
};
