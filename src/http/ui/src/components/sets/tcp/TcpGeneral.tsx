import { Grid, FormControlLabel, Switch, Typography, Box } from "@mui/material";
import { B4SetConfig, QueueConfig } from "@models/config";
import {
  B4Slider,
  B4RangeSlider,
  B4TextField,
  B4Alert,
  B4FormHeader,
} from "@b4.elements";

interface TcpGeneralProps {
  config: B4SetConfig;
  queue: QueueConfig;
  onChange: (
    field: string,
    value: string | number | boolean | number[],
  ) => void;
}

export const TcpGeneral = ({ config, queue, onChange }: TcpGeneralProps) => {
  const dup = config.tcp.duplicate ?? { enabled: false, count: 3 };

  return (
    <>
      {/* Basic TCP Settings */}
      <B4FormHeader label="Limits & Timing" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Slider
            label="Connection Packets Limit"
            value={config.tcp.conn_bytes_limit}
            onChange={(value: number) =>
              onChange("tcp.conn_bytes_limit", value)
            }
            min={1}
            max={queue.tcp_conn_bytes_limit}
            step={1}
            helperText={`Max: ${queue.tcp_conn_bytes_limit} (system limit)`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4RangeSlider
            label="Segment 2 Delay"
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
            helperText="Delay between TCP segments. Use a range for random delay per packet."
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4TextField
            label="Port Filter"
            value={config.tcp.dport_filter}
            onChange={(e) => onChange("tcp.dport_filter", e.target.value)}
            placeholder="e.g., 80,5222,8000-9000"
            helperText="Match specific TCP ports (Telegram, XMPP, etc.) - port 443 is always included"
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
                  Drop SACK Options
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Strip Selective Acknowledgment from TCP headers to confuse
                  stateful DPI
                </Typography>
              </Box>
            }
          />
        </Grid>
      </Grid>

      {/* Packet Duplication */}
      <B4FormHeader label="Packet Duplication" />
      <Grid container spacing={3}>
        <B4Alert>
          Some ISPs throttle by randomly dropping outgoing packets to specific
          IP ranges (e.g. Telegram subnets). Duplication sends multiple copies
          of each packet. When enabled, all other DPI evasion is bypassed for
          this set. Applies to all configured TCP ports.
        </B4Alert>
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
                  Enable Packet Duplication
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Drop original packet and send multiple copies via raw socket
                </Typography>
              </Box>
            }
          />
        </Grid>
        {dup.enabled && (
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Slider
              label="Copy Count"
              value={dup.count}
              onChange={(value: number) => onChange("tcp.duplicate.count", value)}
              min={1}
              max={10}
              step={1}
              helperText="Number of packet copies to send (original is dropped)"
            />
          </Grid>
        )}
      </Grid>

    </>
  );
};
