import {
  Grid,
  Box,
  Typography,
  Stack,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
} from "@mui/material";
import {
  DnsIcon,
  SecurityIcon,
  CheckIcon,
  BlockIcon,
  SpeedIcon,
} from "@b4.icons";
import {
  B4Alert,
  B4Badge,
  B4Section,
  B4Switch,
  B4TextField,
} from "@b4.elements";
import { B4SetConfig } from "@models/config";
import { colors } from "@design";
import dns from "@assets/dns.json";
import { useTranslation } from "react-i18next";

interface DnsEntry {
  name: string;
  ip: string;
  ipv6: boolean;
  desc: string;
  dnssec?: boolean;
  tags: string[];
  warn?: boolean;
}

interface DnsSettingsProps {
  readonly config: B4SetConfig;
  readonly ipv6: boolean;
  readonly onChange: (field: string, value: string | boolean) => void;
}

const POPULAR_DNS = (dns as DnsEntry[]).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function DnsSettings({ config, onChange, ipv6 }: DnsSettingsProps) {
  const { t } = useTranslation();
  const dnsConfig = config.dns || { enabled: false, target_dns: "" };
  const selectedServer = POPULAR_DNS.find((d) => d.ip === dnsConfig.target_dns);

  const handleServerSelect = (ip: string) => {
    onChange("dns.target_dns", ip);
  };

  return (
    <B4Section
      title={t("sets.dns.sectionTitle")}
      description={t("sets.dns.sectionDescription")}
      icon={<DnsIcon />}
    >
      <Grid container spacing={3}>
        <B4Alert severity="info" sx={{ m: 0 }}>
          {t("sets.dns.alert")}
        </B4Alert>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4Switch
            label={t("sets.dns.enable")}
            checked={dnsConfig.enabled}
            onChange={(checked: boolean) => onChange("dns.enabled", checked)}
            description={t("sets.dns.enableDesc")}
          />
        </Grid>

        {dnsConfig.enabled && (
          <>
            <Grid size={{ xs: 12, md: 6 }}>
              <B4Switch
                label={t("sets.dns.fragmentQuery")}
                checked={dnsConfig.fragment_query || false}
                onChange={(checked: boolean) =>
                  onChange("dns.fragment_query", checked)
                }
                description={t("sets.dns.fragmentQueryDesc")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <B4TextField
                label={t("sets.dns.serverIp")}
                value={dnsConfig.target_dns}
                onChange={(e) => onChange("dns.target_dns", e.target.value)}
                placeholder={t("sets.dns.serverIpPlaceholder")}
                helperText={t("sets.dns.serverIpHelper")}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              {selectedServer && (
                <Box
                  sx={{
                    p: 2,
                    bgcolor: colors.background.paper,
                    borderRadius: 1,
                    border: `1px solid ${colors.border.default}`,
                    height: "100%",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <DnsIcon sx={{ color: colors.secondary }} />
                    <Typography variant="subtitle2">
                      {selectedServer.name}
                    </Typography>
                    {selectedServer.dnssec && (
                      <B4Badge
                        icon={<SecurityIcon />}
                        label="DNSSEC"
                        variant="outlined"
                        color="secondary"
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {selectedServer.desc}
                  </Typography>
                </Box>
              )}
            </Grid>

            {/* DNS server list */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t("sets.dns.recommendedServers")}
              </Typography>
              <Box
                sx={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 1,
                  bgcolor: colors.background.paper,
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                <List dense disablePadding>
                  {POPULAR_DNS.filter((server) =>
                    ipv6 ? server.ipv6 : !server.ipv6,
                  ).map((server) => (
                    <ListItemButton
                      key={server.ip}
                      selected={dnsConfig.target_dns === server.ip}
                      onClick={() => handleServerSelect(server.ip)}
                      sx={{
                        borderLeft: server.warn
                          ? `3px solid ${colors.quaternary}`
                          : "3px solid transparent",
                        "&.Mui-selected": {
                          bgcolor: `${colors.secondary}22`,
                          borderLeftColor: colors.secondary,
                          "&:hover": { bgcolor: `${colors.secondary}33` },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {(() => {
                          if (dnsConfig.target_dns === server.ip) {
                            return (
                              <CheckIcon
                                sx={{ color: colors.secondary, fontSize: 20 }}
                              />
                            );
                          }
                          if (server.warn) {
                            return (
                              <BlockIcon
                                sx={{ color: colors.secondary, fontSize: 20 }}
                              />
                            );
                          }
                          return (
                            <DnsIcon
                              sx={{
                                color: colors.text.secondary,
                                fontSize: 20,
                              }}
                            />
                          );
                        })()}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "monospace",
                                color: server.warn
                                  ? colors.secondary
                                  : "inherit",
                              }}
                            >
                              {server.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {server.ip}
                            </Typography>
                            {server.tags.includes("fast") && (
                              <SpeedIcon
                                sx={{ fontSize: 14, color: colors.secondary }}
                              />
                            )}
                            {server.tags.includes("adblock") && (
                              <BlockIcon
                                sx={{ fontSize: 14, color: colors.secondary }}
                              />
                            )}
                          </Stack>
                        }
                        secondary={server.desc}
                        slotProps={{
                          secondary: {
                            variant: "caption",
                            sx: {
                              color: server.warn ? colors.secondary : undefined,
                            },
                          },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            </Grid>

            {/* Visual explanation */}
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: colors.background.paper,
                  borderRadius: 1,
                  border: `1px solid ${colors.border.default}`,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                  sx={{ mb: 1 }}
                >
                  {t("sets.dns.howItWorks")}
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <B4Badge
                    label={t("sets.dns.vizApp")}
                    sx={{ bgcolor: colors.accent.primary }}
                  />
                  <Typography variant="caption">{t("sets.dns.vizQueryFor")}</Typography>
                  <B4Badge
                    label="instagram.com"
                    size="small"
                    sx={{
                      bgcolor: colors.accent.secondary,
                      color: colors.secondary,
                    }}
                  />
                  <Typography variant="caption">→</Typography>
                  <B4Badge
                    label={t("sets.dns.vizPoisoned")}
                    size="small"
                    sx={{
                      bgcolor: colors.quaternary,
                      textDecoration: "line-through",
                    }}
                  />
                  <Typography variant="caption">→</Typography>
                  <B4Badge
                    label={dnsConfig.target_dns || t("sets.dns.vizSelectDns")}
                    size="small"
                    sx={{
                      bgcolor: dnsConfig.target_dns
                        ? colors.tertiary
                        : colors.accent.primary,
                    }}
                  />
                  <Typography variant="caption">{t("sets.dns.vizRealIp")}</Typography>
                </Stack>
              </Box>
            </Grid>

            {/* Warnings */}
            {!dnsConfig.target_dns && (
              <B4Alert severity="warning" sx={{ m: 0 }}>
                {t("sets.dns.noServerWarning")}
              </B4Alert>
            )}

            {dnsConfig.target_dns === "8.8.8.8" && (
              <B4Alert severity="warning" sx={{ m: 0 }}>
                {t("sets.dns.googleWarning")}
              </B4Alert>
            )}
          </>
        )}
      </Grid>
    </B4Section>
  );
}
