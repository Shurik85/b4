import { Grid, FormControlLabel, Switch, Typography, Box } from "@mui/material";
import { B4SetConfig, QueueConfig } from "@models/config";
import {
  B4Slider,
  B4RangeSlider,
  B4TextField,
  B4Alert,
  B4FormHeader,
} from "@b4.elements";
import { useTranslation } from "react-i18next";

interface TcpGeneralProps {
  config: B4SetConfig;
  queue: QueueConfig;
  onChange: (
    field: string,
    value: string | number | boolean | number[],
  ) => void;
}

export const TcpGeneral = ({ config, queue, onChange }: TcpGeneralProps) => {
  const { t } = useTranslation();
  const dup = config.tcp.duplicate ?? { enabled: false, count: 3 };
  const ibd = config.tcp.ip_block_detect ?? {
    enabled: false,
    retransmit_threshold: 3,
    timeout_ms: 3000,
    cache_blocked_ips: true,
  };
  const rstProt = {
    enabled: false,
    ttl_tolerance: 3,
    ...config.tcp.rst_protection,
  };

  return (
    <>
      {/* Basic TCP Settings */}
      <B4FormHeader label={t("sets.tcp.general.limitsTiming")} />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Slider
            label={t("sets.tcp.general.connPacketsLimit")}
            value={config.tcp.conn_bytes_limit}
            onChange={(value: number) =>
              onChange("tcp.conn_bytes_limit", value)
            }
            min={1}
            max={queue.tcp_conn_bytes_limit}
            step={1}
            helperText={t("sets.tcp.general.connPacketsMax", {
              max: queue.tcp_conn_bytes_limit,
            })}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4RangeSlider
            label={t("sets.tcp.general.seg2delay")}
            value={[
              config.tcp.seg2delay,
              config.tcp.seg2delay_max || config.tcp.seg2delay,
            ]}
            onChange={(value: [number, number]) => {
              onChange("tcp.seg2delay", value[0]);
              onChange("tcp.seg2delay_max", value[1]);
            }}
            min={0}
            max={1000}
            step={10}
            valueSuffix=" ms"
            helperText={t("sets.tcp.general.seg2delayHelper")}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4TextField
            label={t("sets.tcp.general.portFilter")}
            value={config.tcp.dport_filter}
            onChange={(e) => onChange("tcp.dport_filter", e.target.value)}
            placeholder={t("sets.tcp.general.portFilterPlaceholder")}
            helperText={t("sets.tcp.general.portFilterHelper")}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <FormControlLabel
            control={
              <Switch
                checked={config.tcp.drop_sack || false}
                onChange={(e) => onChange("tcp.drop_sack", e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {t("sets.tcp.general.dropSack")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("sets.tcp.general.dropSackDesc")}
                </Typography>
              </Box>
            }
          />
        </Grid>
      </Grid>

      {/* Packet Duplication */}
      <B4FormHeader label={t("sets.tcp.general.packetDuplication")} />
      <Grid container spacing={3}>
        <B4Alert>{t("sets.tcp.general.dupAlert")}</B4Alert>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormControlLabel
            control={
              <Switch
                checked={dup.enabled}
                onChange={(e) =>
                  onChange("tcp.duplicate.enabled", e.target.checked)
                }
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {t("sets.tcp.general.dupEnable")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("sets.tcp.general.dupEnableDesc")}
                </Typography>
              </Box>
            }
          />
        </Grid>
        {dup.enabled && (
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Slider
              label={t("sets.tcp.general.dupCount")}
              value={dup.count}
              onChange={(value: number) =>
                onChange("tcp.duplicate.count", value)
              }
              min={1}
              max={10}
              step={1}
              helperText={t("sets.tcp.general.dupCountHelper")}
            />
          </Grid>
        )}
      </Grid>

      {/* IP Block Detection */}
      <B4FormHeader label={t("sets.tcp.general.ipBlockDetect")} />
      <Grid container spacing={3}>
        <B4Alert>{t("sets.tcp.general.ibdAlert")}</B4Alert>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormControlLabel
            control={
              <Switch
                checked={ibd.enabled}
                onChange={(e) =>
                  onChange("tcp.ip_block_detect.enabled", e.target.checked)
                }
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {t("sets.tcp.general.ibdEnable")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("sets.tcp.general.ibdEnableDesc")}
                </Typography>
              </Box>
            }
          />
        </Grid>
        {ibd.enabled && (
          <>
            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label={t("sets.tcp.general.ibdThreshold")}
                value={ibd.retransmit_threshold}
                onChange={(value: number) =>
                  onChange("tcp.ip_block_detect.retransmit_threshold", value)
                }
                min={1}
                max={10}
                step={1}
                helperText={t("sets.tcp.general.ibdThresholdHelper")}
              />
              {ibd.retransmit_threshold <= 1 && (
                <B4Alert severity="warning">
                  {t("sets.tcp.general.ibdThresholdWarn")}
                </B4Alert>
              )}
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label={t("sets.tcp.general.ibdTimeout")}
                value={ibd.timeout_ms}
                onChange={(value: number) =>
                  onChange("tcp.ip_block_detect.timeout_ms", value)
                }
                min={1000}
                max={10000}
                step={500}
                valueSuffix=" ms"
                helperText={t("sets.tcp.general.ibdTimeoutHelper")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={ibd.cache_blocked_ips}
                    onChange={(e) =>
                      onChange(
                        "tcp.ip_block_detect.cache_blocked_ips",
                        e.target.checked,
                      )
                    }
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" fontWeight={500}>
                      {t("sets.tcp.general.ibdCache")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("sets.tcp.general.ibdCacheDesc")}
                    </Typography>
                  </Box>
                }
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* RST Protection */}
      <B4FormHeader label={t("sets.tcp.general.rstProtection")} />
      <Grid container spacing={3}>
        <B4Alert>{t("sets.tcp.general.rstAlert")}</B4Alert>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormControlLabel
            control={
              <Switch
                checked={rstProt.enabled}
                onChange={(e) =>
                  onChange("tcp.rst_protection.enabled", e.target.checked)
                }
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1" fontWeight={500}>
                  {t("sets.tcp.general.rstEnable")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("sets.tcp.general.rstEnableDesc")}
                </Typography>
              </Box>
            }
          />
        </Grid>
        {rstProt.enabled && (
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Slider
              label={t("sets.tcp.general.rstTtlTolerance")}
              value={rstProt.ttl_tolerance}
              onChange={(value: number) =>
                onChange("tcp.rst_protection.ttl_tolerance", value)
              }
              min={1}
              max={20}
              step={1}
              helperText={t("sets.tcp.general.rstTtlToleranceHelper")}
            />
          </Grid>
        )}
      </Grid>
    </>
  );
};
