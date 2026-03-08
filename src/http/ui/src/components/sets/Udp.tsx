import { Grid } from "@mui/material";
import { DnsIcon, WarningIcon } from "@b4.icons";
import {
  B4Slider,
  B4RangeSlider,
  B4Switch,
  B4Select,
  B4TextField,
  B4Section,
  B4Alert,
  B4FormHeader,
} from "@b4.elements";
import { B4SetConfig, QueueConfig } from "@models/config";

interface UdpSettingsProps {
  config: B4SetConfig;
  queue: QueueConfig;
  onChange: (field: string, value: string | boolean | number) => void;
}

const UDP_MODES = [
  {
    value: "drop",
    label: "Drop",
    description: "Drop matched UDP packets (forces TCP fallback)",
  },
  {
    value: "fake",
    label: "Fake & Fragment",
    description: "Send fake packets and fragment real ones (DPI bypass)",
  },
];

const UDP_QUIC_FILTERS = [
  {
    value: "disabled",
    label: "Disabled",
    description: "Don't process QUIC at all",
  },
  {
    value: "all",
    label: "All QUIC",
    description: "Match all QUIC Initial packets (blind matching)",
  },
  {
    value: "parse",
    label: "Parse SNI",
    description: "Match only QUIC with SNI in domain list (smart matching)",
  },
];

const UDP_FAKING_STRATEGIES = [
  { value: "none", label: "None", description: "No faking strategy" },
  {
    value: "ttl",
    label: "TTL",
    description: "Use low TTL to make packets expire",
  },
  { value: "checksum", label: "Checksum", description: "Corrupt UDP checksum" },
];

export const UdpSettings = ({ config, queue, onChange }: UdpSettingsProps) => {
  const isQuicEnabled = config.udp.filter_quic !== "disabled";
  const hasPortFilter =
    config.udp.dport_filter && config.udp.dport_filter.trim() !== "";
  const hasDomainsConfigured =
    config.targets?.sni_domains?.length > 0 ||
    config.targets?.geosite_categories?.length > 0;

  const willProcessUdp = isQuicEnabled || hasPortFilter;

  const showActionSettings = willProcessUdp;

  const isFakeMode = config.udp.mode === "fake";
  const showFakeSettings = showActionSettings && isFakeMode;

  const showParseWarning =
    config.udp.filter_quic === "parse" && !hasDomainsConfigured;
  const showNoProcessingWarning = !willProcessUdp;

  return (
    <B4Section
      title="UDP & QUIC Configuration"
      description="Configure UDP packet processing and QUIC filtering"
      icon={<DnsIcon />}
    >
      <Grid container spacing={3}>
        <B4FormHeader label="What UDP Traffic to Process" />

        <Grid size={{ xs: 12, md: 6 }}>
          <B4Select
            label="QUIC Filter"
            value={config.udp.filter_quic}
            options={UDP_QUIC_FILTERS}
            onChange={(e) =>
              onChange("udp.filter_quic", e.target.value as string)
            }
            helperText={
              UDP_QUIC_FILTERS.find((o) => o.value === config.udp.filter_quic)
                ?.description
            }
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4TextField
            label="Port Filter"
            value={config.udp.dport_filter}
            onChange={(e) => onChange("udp.dport_filter", e.target.value)}
            placeholder="e.g., 5000-6000,8000"
            helperText="Match specific UDP ports (VoIP, gaming, etc.) - leave empty to disable"
          />
        </Grid>

        {/* STUN Filter */}
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Switch
            label="Filter STUN Packets"
            checked={config.udp.filter_stun}
            onChange={(checked) => onChange("udp.filter_stun", checked)}
            description="Ignore STUN packets (recommended for voice/video calls)"
          />
        </Grid>

        {/* Parse mode warning */}
        {showParseWarning && (
          <B4Alert severity="warning" icon={<WarningIcon />}>
            <strong>Parse mode requires domains:</strong> Add domains in the
            Targets section for SNI matching to work. Without domains, no QUIC
            traffic will be processed.
          </B4Alert>
        )}

        {/* No processing warning */}
        {showNoProcessingWarning && (
          <B4Alert>
            <strong>UDP processing disabled:</strong> Enable QUIC filtering or
            add port filters to process UDP traffic. Currently, all UDP packets
            will pass through unchanged.
          </B4Alert>
        )}

        {/* Section 2: Action Settings (only if traffic will be processed) */}
        {showActionSettings && (
          <>
            <B4FormHeader label="How to Handle Matched Traffic" />

            {/* UDP Mode */}
            <Grid size={{ xs: 12, md: 6 }}>
              <B4Select
                label="Action Mode"
                value={config.udp.mode}
                options={UDP_MODES}
                onChange={(e) => onChange("udp.mode", e.target.value as string)}
                helperText={
                  UDP_MODES.find((o) => o.value === config.udp.mode)
                    ?.description
                }
              />
            </Grid>

            {/* Connection Packets Limit */}
            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label="Connection Packets Limit"
                value={config.udp.conn_bytes_limit}
                onChange={(value) => onChange("udp.conn_bytes_limit", value)}
                min={1}
                max={queue.udp_conn_bytes_limit}
                step={1}
                helperText={`Max: ${queue.udp_conn_bytes_limit} (system limit)`}
              />
            </Grid>

            {/* Info about current mode */}
            <B4Alert>
              {isFakeMode ? (
                <>
                  <strong>Fake mode:</strong> Matched UDP packets will be
                  preceded by fake packets and fragmented to bypass DPI systems.
                  Configure fake packet settings below.
                </>
              ) : (
                <>
                  <strong>Drop mode:</strong> Matched UDP packets will be
                  dropped, forcing the application to fall back to TCP (e.g.,
                  QUIC → HTTPS).
                </>
              )}
            </B4Alert>
          </>
        )}

        {/* Section 3: Fake Mode Settings (only if fake mode is enabled) */}
        {showFakeSettings && (
          <>
            <B4FormHeader label="Fake Packet Configuration" />

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Select
                label="Faking Strategy"
                value={config.udp.faking_strategy}
                options={UDP_FAKING_STRATEGIES}
                onChange={(e) =>
                  onChange("udp.faking_strategy", e.target.value as string)
                }
                helperText={
                  UDP_FAKING_STRATEGIES.find(
                    (o) => o.value === config.udp.faking_strategy
                  )?.description
                }
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label="Fake Packet Count"
                value={config.udp.fake_seq_length}
                onChange={(value) => onChange("udp.fake_seq_length", value)}
                min={1}
                max={20}
                step={1}
                helperText="Number of fake packets sent before real packet"
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label="Fake Packet Size"
                value={config.udp.fake_len}
                onChange={(value) => onChange("udp.fake_len", value)}
                min={32}
                max={1500}
                step={8}
                valueSuffix=" bytes"
                helperText="Size of each fake UDP packet payload"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <B4RangeSlider
                label="Segment 2 Delay"
                value={[config.udp.seg2delay, config.udp.seg2delay_max || config.udp.seg2delay]}
                onChange={(value: [number, number]) => {
                  onChange("udp.seg2delay", value[0]);
                  onChange("udp.seg2delay_max", value[1]);
                }}
                min={0}
                max={1000}
                step={10}
                valueSuffix=" ms"
                helperText="Delay between segments. Use a range for random delay per packet."
              />
            </Grid>
          </>
        )}
      </Grid>
    </B4Section>
  );
};
