import { useCaptures } from "@b4.capture";
import {
  B4Accordion,
  B4Alert,
  B4ChipList,
  B4FormHeader,
  B4PlusButton,
  B4Select,
  B4Slider,
  B4Switch,
  B4TextField,
} from "@b4.elements";
import {
  B4SetConfig,
  DesyncMode,
  FakingPayloadType,
  IncomingMode,
  MutationMode,
  WindowMode,
} from "@models/config";
import {
  Box,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link } from "react-router";

interface TcpFakingProps {
  config: B4SetConfig;
  onChange: (
    field: string,
    value: string | boolean | number | string[] | number[],
  ) => void;
}

const FAKE_STRATEGIES = [
  { value: "ttl", label: "TTL" },
  { value: "randseq", label: "Random Sequence" },
  { value: "pastseq", label: "Past Sequence" },
  { value: "tcp_check", label: "TCP Check" },
  { value: "md5sum", label: "MD5 Sum" },
  { value: "timestamp", label: "TCP Timestamp" },
];

const FAKE_PAYLOAD_TYPES = [
  { value: 0, label: "Random" },
  // { value: 1, label: "Custom" },
  { value: 2, label: "Preset: Google (classic)" },
  { value: 3, label: "Preset: DuckDuckGo" },
  { value: 4, label: "My own Payload File" },
  { value: 5, label: "All Zeros" },
  { value: 6, label: "Inverted Original" },
];

const MUTATION_MODES: { value: MutationMode; label: string }[] = [
  { value: "off", label: "Disabled" },
  { value: "random", label: "Random" },
  { value: "grease", label: "GREASE Extensions" },
  { value: "padding", label: "Padding" },
  { value: "fakeext", label: "Fake Extensions" },
  { value: "fakesni", label: "Fake SNIs" },
  { value: "advanced", label: "Advanced (All)" },
];

const mutationModeDescriptions: Record<MutationMode, string> = {
  off: "No ClientHello mutation applied",
  random: "Randomize extension order and add noise",
  grease: "Insert GREASE extensions to confuse DPI",
  padding: "Add padding extension to reach target size",
  fakeext: "Insert fake/unknown TLS extensions",
  fakesni: "Add additional fake SNI entries",
  advanced: "Combine multiple mutation techniques",
};

const desyncModeOptions: { label: string; value: DesyncMode }[] = [
  { label: "Disabled", value: "off" },
  { label: "RST Packets", value: "rst" },
  { label: "FIN Packets", value: "fin" },
  { label: "ACK Packets", value: "ack" },
  { label: "Combo (RST + FIN)", value: "combo" },
  { label: "Full (RST + FIN + ACK)", value: "full" },
];

const desyncModeDescriptions: Record<DesyncMode, string> = {
  off: "No desynchronization - packets sent normally",
  rst: "Inject fake RST packets with bad checksums to disrupt DPI state tracking",
  fin: "Inject fake FIN packets with past sequence numbers to confuse connection state",
  ack: "Inject fake ACK packets with random future sequence/ack numbers",
  combo: "Send RST + FIN + ACK sequence for stronger desync effect",
  full: "Full attack: fake SYN, overlapping RSTs, PSH, and URG packets",
};

const windowModeOptions: { label: string; value: WindowMode }[] = [
  { label: "Disabled", value: "off" },
  { label: "Zero Window", value: "zero" },
  { label: "Random Window", value: "random" },
  { label: "Oscillate", value: "oscillate" },
  { label: "Escalate", value: "escalate" },
];

const windowModeDescriptions: Record<WindowMode, string> = {
  off: "No window manipulation - use actual TCP window",
  zero: "Send fake packets: first with window=0, then window=65535",
  random: "Send 3-5 fake packets with random window sizes from your list",
  oscillate: "Cycle through your custom window values sequentially",
  escalate: "Gradually increase: 0 → 100 → 500 → 1460 → 8192 → 32768 → 65535",
};

const incomingModeOptions: { label: string; value: IncomingMode }[] = [
  { label: "Disabled", value: "off" },
  { label: "Fake Packets", value: "fake" },
  { label: "Reset Injection", value: "reset" },
  { label: "FIN Injection", value: "fin" },
  { label: "Desync Combo", value: "desync" },
];

const incomingModeDescriptions: Record<IncomingMode, string> = {
  off: "No incoming packet manipulation",
  fake: "Inject corrupted ACK packets toward server with low TTL on every incoming data packet",
  reset: "Inject fake RST packets when incoming bytes threshold reached",
  fin: "Inject fake FIN packets when incoming bytes threshold reached",
  desync: "Inject RST+FIN+ACK combo when incoming bytes threshold reached",
};

const incomingStrategyOptions: { label: string; value: string }[] = [
  { label: "Bad Checksum", value: "badsum" },
  { label: "Bad Sequence", value: "badseq" },
  { label: "Bad ACK", value: "badack" },
  { label: "Random", value: "rand" },
  { label: "All Corruptions", value: "all" },
];

const incomingStrategyDescriptions: Record<string, string> = {
  badsum: "Corrupt TCP checksum only - packets dropped by kernel",
  badseq: "Corrupt sequence number - packets ignored by TCP stack",
  badack: "Corrupt ACK number - packets ignored by TCP stack",
  rand: "Randomly pick corruption method per packet",
  all: "Apply all corruptions: bad seq + bad ack + bad checksum",
};

export const TcpFaking = ({ config, onChange }: TcpFakingProps) => {
  const [newFakeSni, setNewFakeSni] = useState("");
  const [newWinValue, setNewWinValue] = useState("");
  const { captures, loadCaptures } = useCaptures();

  useEffect(() => {
    loadCaptures().catch(() => {});
  }, [loadCaptures]);

  const mutation = config.faking.sni_mutation || {
    mode: "off" as MutationMode,
    grease_count: 3,
    padding_size: 2048,
    fake_ext_count: 5,
    fake_snis: [],
  };

  const isMutationEnabled = mutation.mode !== "off";
  const showGreaseSettings = ["grease", "advanced"].includes(mutation.mode);
  const showPaddingSettings = ["padding", "advanced"].includes(mutation.mode);
  const showFakeExtSettings = ["fakeext", "advanced"].includes(mutation.mode);
  const showFakeSniSettings = ["fakesni", "advanced"].includes(mutation.mode);

  const isDesyncEnabled = config.tcp.desync.mode !== "off";

  const winValues = config.tcp.win.values || [0, 1460, 8192, 65535];
  const showWinValues = ["oscillate", "random"].includes(config.tcp.win.mode);

  // Status summaries for accordion headers
  const fakeSniStatus = config.faking.sni
    ? FAKE_STRATEGIES.find((s) => s.value === config.faking.strategy)?.label ||
      "Enabled"
    : "Disabled";

  const synFakeStatus =
    [config.tcp.syn_fake && "SYN", config.faking.tcp_md5 && "MD5"]
      .filter(Boolean)
      .join(" + ") || "Disabled";

  const desyncStatus = isDesyncEnabled
    ? desyncModeOptions.find((o) => o.value === config.tcp.desync.mode)
        ?.label || "Enabled"
    : "Disabled";

  const windowStatus =
    config.tcp.win.mode === "off"
      ? "Disabled"
      : windowModeOptions.find((o) => o.value === config.tcp.win.mode)?.label ||
        "Enabled";

  const incomingStatus =
    (config.tcp.incoming?.mode || "off") === "off"
      ? "Disabled"
      : incomingModeOptions.find((o) => o.value === config.tcp.incoming?.mode)
          ?.label || "Enabled";

  const mutationStatus = isMutationEnabled
    ? MUTATION_MODES.find((m) => m.value === mutation.mode)?.label || "Enabled"
    : "Disabled";

  const handleAddFakeSni = () => {
    if (newFakeSni.trim()) {
      const current = mutation.fake_snis || [];
      if (!current.includes(newFakeSni.trim())) {
        onChange("faking.sni_mutation.fake_snis", [
          ...current,
          newFakeSni.trim(),
        ]);
      }
      setNewFakeSni("");
    }
  };

  const handleRemoveFakeSni = (sni: string) => {
    const current = mutation.fake_snis || [];
    onChange(
      "faking.sni_mutation.fake_snis",
      current.filter((s) => s !== sni),
    );
  };

  const handleAddWinValue = () => {
    const val = Number.parseInt(newWinValue, 10);
    if (
      !Number.isNaN(val) &&
      val >= 0 &&
      val <= 65535 &&
      !winValues.includes(val)
    ) {
      onChange(
        "tcp.win.values",
        [...winValues, val].sort((a, b) => a - b),
      );
      setNewWinValue("");
    }
  };

  const handleRemoveWinValue = (val: number) => {
    onChange(
      "tcp.win.values",
      winValues.filter((v) => v !== val),
    );
  };

  return (
    <Stack spacing={1.5}>
      {/* Fake SNI Configuration */}
      <B4Accordion
        title="Fake SNI Packets"
        status={fakeSniStatus}
        enabled={config.faking.sni}
        defaultExpanded
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <B4Switch
              label="Enable Fake SNI"
              checked={config.faking.sni}
              onChange={(checked: boolean) => onChange("faking.sni", checked)}
              description="Send fake SNI packets before real ClientHello"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Select
              label="Fake Strategy"
              value={config.faking.strategy}
              options={FAKE_STRATEGIES}
              onChange={(e) =>
                onChange("faking.strategy", e.target.value as string)
              }
              helperText="How to make fake packets unprocessable by server"
              disabled={!config.faking.sni}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack>
              <B4Select
                label="Fake Payload Type"
                value={config.faking.sni_type}
                options={FAKE_PAYLOAD_TYPES}
                onChange={(e) =>
                  onChange("faking.sni_type", Number(e.target.value))
                }
                helperText="Content of fake packets"
                disabled={!config.faking.sni}
              />

              {config.faking.sni_type === FakingPayloadType.CUSTOM && (
                <Box sx={{ mt: 2 }}>
                  <B4TextField
                    label="Custom Payload (Hex)"
                    value={config.faking.custom_payload}
                    onChange={(e) =>
                      onChange("faking.custom_payload", e.target.value)
                    }
                    helperText="Hex-encoded payload for fake packets (use Capture feature to get real payloads)"
                    disabled={!config.faking.sni}
                    multiline
                    rows={2}
                  />
                </Box>
              )}
            </Stack>
          </Grid>
          {config.faking.sni_type === FakingPayloadType.CAPTURE && (
            <Grid container size={{ xs: 12 }}>
              {captures.length > 0 && (
                <Grid size={{ xs: 6 }}>
                  <B4Select
                    label="Generated Payload"
                    value={config.faking.payload_file}
                    options={[
                      { value: "", label: "Select a payload..." },
                      ...captures.map((c) => ({
                        value: c.filepath,
                        label: `${c.domain} (${c.size} bytes)`,
                      })),
                    ]}
                    onChange={(e) =>
                      onChange("faking.payload_file", e.target.value as string)
                    }
                    helperText={
                      captures.length === 0
                        ? "No payloads available. Generate one in Settings first."
                        : "Select a generated/uploaded TLS ClientHello (SNI-first)"
                    }
                    disabled={!config.faking.sni || captures.length === 0}
                  />
                </Grid>
              )}
              <Grid size={{ xs: captures.length > 0 ? 6 : 12 }}>
                <B4Alert>
                  {captures.length === 0 &&
                    "No TLS payloads available. Generate optimized payloads (SNI-first for DPI bypass) or upload your own."}

                  <Link to="/settings/capture">
                    {" "}
                    Navigate to Settings to generate or upload TLS ClientHello
                    payloads.
                  </Link>
                </B4Alert>
              </Grid>
            </Grid>
          )}
          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Fake TTL"
              value={config.faking.ttl}
              onChange={(value: number) => onChange("faking.ttl", value)}
              min={1}
              max={64}
              step={1}
              helperText="TTL for fake packets (should expire before server)"
              disabled={!config.faking.sni}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <B4TextField
              label="Sequence Offset"
              type="number"
              value={config.faking.seq_offset}
              onChange={(e) =>
                onChange("faking.seq_offset", Number(e.target.value))
              }
              helperText="TCP sequence number offset for pastseq strategy"
              disabled={!config.faking.sni}
            />
          </Grid>
          {config.faking.strategy === "timestamp" && (
            <Grid size={{ xs: 12, md: 4 }}>
              <B4TextField
                label="Timestamp Decrease"
                type="number"
                value={config.faking.timestamp_decrease || 600000}
                onChange={(e) =>
                  onChange("faking.timestamp_decrease", Number(e.target.value))
                }
                helperText="Amount to decrease TCP timestamp option (default: 600000)"
                disabled={!config.faking.sni}
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Fake Packet Count"
              value={config.faking.sni_seq_length}
              onChange={(value: number) =>
                onChange("faking.sni_seq_length", value)
              }
              min={1}
              max={20}
              step={1}
              helperText="Number of fake packets to send"
              disabled={!config.faking.sni}
            />
          </Grid>
          {/* TLS Mod Options - only show when payload has TLS structure */}
          {config.faking.sni_type !== FakingPayloadType.RANDOM && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Fake Packet TLS Modification
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 1 }}
              >
                Modify fake TLS ClientHello to improve bypass
              </Typography>
              <Stack direction="row" spacing={2}>
                <B4Switch
                  label="Randomize TLS Random"
                  checked={(config.faking.tls_mod || []).includes("rnd")}
                  onChange={(checked: boolean) => {
                    const current = config.faking.tls_mod || [];
                    const next = checked
                      ? [...current.filter((m) => m !== "rnd"), "rnd"]
                      : current.filter((m) => m !== "rnd");
                    onChange("faking.tls_mod", next);
                  }}
                  description="Replace 32-byte Random field in fake packets"
                  disabled={!config.faking.sni}
                />
                <B4Switch
                  label="Duplicate Session ID"
                  checked={(config.faking.tls_mod || []).includes("dupsid")}
                  onChange={(checked: boolean) => {
                    const current = config.faking.tls_mod || [];
                    const next = checked
                      ? [...current.filter((m) => m !== "dupsid"), "dupsid"]
                      : current.filter((m) => m !== "dupsid");
                    onChange("faking.tls_mod", next);
                  }}
                  description="Copy Session ID from real ClientHello into fake"
                  disabled={!config.faking.sni}
                />
              </Stack>
            </Grid>
          )}
        </Grid>
      </B4Accordion>

      {/* SYN Fake Packets */}
      <B4Accordion
        title="SYN Fake Packets"
        status={synFakeStatus}
        enabled={config.tcp.syn_fake || config.faking.tcp_md5}
      >
        <B4Alert noWrapper>
          Send fake SYN packets during the TCP handshake phase to pre-confuse
          DPI state tracking before the real connection starts.
        </B4Alert>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.tcp.syn_fake || false}
                  onChange={(e) => onChange("tcp.syn_fake", e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    SYN Fake Packets
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Send fake SYN packets during handshake (aggressive
                    technique)
                  </Typography>
                </Box>
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.faking.tcp_md5 || false}
                  onChange={(e) => onChange("faking.tcp_md5", e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    SYN MD5 Signature
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Send fake SYN with TCP MD5 option before real handshake
                  </Typography>
                </Box>
              }
            />
          </Grid>

          {config.tcp.syn_fake && (
            <>
              <Grid size={{ xs: 12, md: 6 }}>
                <B4Slider
                  label="SYN Fake Payload Length"
                  value={config.tcp.syn_fake_len || 0}
                  onChange={(value: number) =>
                    onChange("tcp.syn_fake_len", value)
                  }
                  min={0}
                  max={1200}
                  step={64}
                  valueSuffix=" bytes"
                  helperText="0 = header only, >0 = add fake TLS payload"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <B4Slider
                  label="SYN Fake TTL"
                  value={config.tcp.syn_ttl || 0}
                  onChange={(value: number) => onChange("tcp.syn_ttl", value)}
                  min={1}
                  max={100}
                  step={1}
                  valueSuffix=" ms"
                  helperText="TTL value for SYN fake packets (default 3 if unset)"
                />
              </Grid>
            </>
          )}
        </Grid>
      </B4Accordion>

      {/* TCP Desync Configuration */}
      <B4Accordion
        title="TCP Desync Attack"
        status={desyncStatus}
        enabled={isDesyncEnabled}
      >
        <B4Alert noWrapper>
          Desync attacks inject fake TCP control packets (RST/FIN/ACK) with
          corrupted checksums and low TTL. These packets confuse stateful DPI
          systems but are discarded by the real server.
        </B4Alert>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <B4Select
              label="Desync Mode"
              value={config.tcp.desync.mode}
              options={desyncModeOptions}
              onChange={(e) =>
                onChange("tcp.desync.mode", e.target.value as string)
              }
              helperText={desyncModeDescriptions[config.tcp.desync.mode]}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Desync TTL"
              value={config.tcp.desync.ttl}
              onChange={(value: number) => onChange("tcp.desync.ttl", value)}
              min={1}
              max={50}
              step={1}
              disabled={!isDesyncEnabled}
              helperText={
                isDesyncEnabled
                  ? "Low TTL ensures packets expire before reaching server"
                  : "Enable desync mode first"
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Desync Packet Count"
              value={config.tcp.desync.count}
              onChange={(value: number) => onChange("tcp.desync.count", value)}
              min={1}
              max={20}
              step={1}
              disabled={!isDesyncEnabled}
              helperText={
                isDesyncEnabled
                  ? "Number of fake packets per desync attack"
                  : "Enable desync mode first"
              }
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.tcp.desync.post_desync || false}
                  onChange={(e) =>
                    onChange("tcp.desync.post_desync", e.target.checked)
                  }
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    Post-ClientHello RST
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Send fake RST after ClientHello to evict connection from DPI
                    tracking table
                  </Typography>
                </Box>
              }
            />
          </Grid>
        </Grid>
      </B4Accordion>

      {/* TCP Window Manipulation */}
      <B4Accordion
        title="Window Manipulation"
        status={windowStatus}
        enabled={config.tcp.win.mode !== "off"}
      >
        <B4Alert noWrapper>
          Window manipulation sends fake ACK packets with modified TCP window
          sizes before your real packet. These fakes use low TTL so they expire
          before reaching the server but confuse middlebox DPI.
        </B4Alert>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Select
              label="Window Mode"
              value={config.tcp.win.mode}
              options={windowModeOptions}
              onChange={(e) =>
                onChange("tcp.win.mode", e.target.value as string)
              }
              helperText={windowModeDescriptions[config.tcp.win.mode]}
            />
          </Grid>

          {showWinValues && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" gutterBottom>
                Custom Window Values
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                {config.tcp.win.mode === "oscillate"
                  ? "Packets will cycle through these values in order"
                  : "Random values will be picked from this list"}
              </Typography>

              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 2,
                      mt: 1,
                      alignItems: "center",
                    }}
                  >
                    <B4TextField
                      label="Add Value (0-65535)"
                      value={newWinValue}
                      onChange={(e) => setNewWinValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddWinValue();
                        }
                      }}
                      type="number"
                    />

                    <B4PlusButton
                      onClick={handleAddWinValue}
                      disabled={!newWinValue}
                    />
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <B4ChipList
                    items={winValues}
                    getKey={(v) => v}
                    getLabel={(v) => v.toLocaleString()}
                    onDelete={handleRemoveWinValue}
                    emptyMessage="No values configured - defaults will be used"
                    showEmpty
                  />
                </Grid>
              </Grid>
            </Grid>
          )}
        </Grid>
      </B4Accordion>

      {/* Incoming Response Bypass */}
      <B4Accordion
        title="Incoming Response Bypass"
        status={incomingStatus}
        enabled={(config.tcp.incoming?.mode || "off") !== "off"}
      >
        <B4Alert noWrapper>
          Manipulates incoming server responses to bypass DPI that throttles
          connections after receiving ~15-20KB. Injects fake packets toward
          server that DPI sees but die before reaching destination.
        </B4Alert>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <B4Select
              label="Incoming Mode"
              value={config.tcp.incoming?.mode || "off"}
              options={incomingModeOptions}
              onChange={(e) =>
                onChange("tcp.incoming.mode", e.target.value as string)
              }
              helperText={
                incomingModeDescriptions[config.tcp.incoming?.mode || "off"]
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Select
              label="Corruption Strategy"
              value={config.tcp.incoming?.strategy || "badsum"}
              options={incomingStrategyOptions}
              onChange={(e) =>
                onChange("tcp.incoming.strategy", e.target.value as string)
              }
              disabled={config.tcp.incoming?.mode === "off"}
              helperText={
                config.tcp.incoming?.mode === "off"
                  ? "Enable incoming mode first"
                  : incomingStrategyDescriptions[
                      config.tcp.incoming?.strategy || "badsum"
                    ]
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Fake TTL"
              value={config.tcp.incoming?.fake_ttl || 3}
              onChange={(value: number) =>
                onChange("tcp.incoming.fake_ttl", value)
              }
              min={1}
              max={20}
              step={1}
              disabled={config.tcp.incoming?.mode === "off"}
              helperText="Low TTL ensures fakes expire before reaching server"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Fake Count"
              value={config.tcp.incoming?.fake_count || 3}
              onChange={(value: number) =>
                onChange("tcp.incoming.fake_count", value)
              }
              min={1}
              max={10}
              step={1}
              disabled={config.tcp.incoming?.mode === "off"}
              helperText="Number of fake packets per injection"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Threshold Min"
              value={config.tcp.incoming?.min || 14}
              onChange={(value: number) => onChange("tcp.incoming.min", value)}
              min={5}
              max={config.tcp.incoming?.max || 150}
              step={1}
              valueSuffix=" KB"
              disabled={
                config.tcp.incoming?.mode === "off" ||
                config.tcp.incoming?.mode === "fake"
              }
              helperText={
                config.tcp.incoming?.mode === "fake"
                  ? "Not used in fake mode (triggers on every packet)"
                  : "Minimum threshold for injection trigger"
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <B4Slider
              label="Threshold Max"
              value={config.tcp.incoming?.max || 14}
              onChange={(value: number) => onChange("tcp.incoming.max", value)}
              min={config.tcp.incoming?.min || 5}
              max={50}
              step={1}
              valueSuffix=" KB"
              disabled={
                config.tcp.incoming?.mode === "off" ||
                config.tcp.incoming?.mode === "fake"
              }
              helperText={
                config.tcp.incoming?.mode === "fake"
                  ? "Not used in fake mode"
                  : config.tcp.incoming?.min === config.tcp.incoming?.max
                    ? "Fixed threshold (min = max)"
                    : "Threshold randomized between min-max per connection"
              }
            />
          </Grid>
        </Grid>
      </B4Accordion>

      {/* ClientHello Mutation Section */}
      <B4Accordion
        title="ClientHello Mutation"
        status={mutationStatus}
        enabled={isMutationEnabled}
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <B4Select
              label="Mutation Mode"
              value={mutation.mode}
              options={MUTATION_MODES}
              onChange={(e) =>
                onChange("faking.sni_mutation.mode", e.target.value as string)
              }
              helperText={mutationModeDescriptions[mutation.mode]}
            />
          </Grid>

          {isMutationEnabled && (
            <>
              {showGreaseSettings && (
                <>
                  <B4FormHeader label="GREASE Configuration" />
                  <Grid size={{ xs: 12 }}>
                    <B4Slider
                      label="GREASE Extension Count"
                      value={mutation.grease_count}
                      onChange={(value: number) =>
                        onChange("faking.sni_mutation.grease_count", value)
                      }
                      min={1}
                      max={10}
                      step={1}
                      helperText="Number of GREASE extensions to insert"
                    />
                  </Grid>
                </>
              )}

              {showPaddingSettings && (
                <>
                  <B4FormHeader label="Padding Configuration" />
                  <Grid size={{ xs: 12 }}>
                    <B4Slider
                      label="Padding Size"
                      value={mutation.padding_size}
                      onChange={(value: number) =>
                        onChange("faking.sni_mutation.padding_size", value)
                      }
                      min={256}
                      max={16384}
                      step={256}
                      valueSuffix=" bytes"
                      helperText="Target ClientHello size with padding"
                    />
                  </Grid>
                </>
              )}

              {showFakeExtSettings && (
                <>
                  <B4FormHeader label="Fake Extensions Configuration" />
                  <Grid size={{ xs: 12 }}>
                    <B4Slider
                      label="Fake Extension Count"
                      value={mutation.fake_ext_count}
                      onChange={(value: number) =>
                        onChange("faking.sni_mutation.fake_ext_count", value)
                      }
                      min={1}
                      max={15}
                      step={1}
                      helperText="Number of fake TLS extensions to insert"
                    />
                  </Grid>
                </>
              )}

              {showFakeSniSettings && (
                <>
                  <B4FormHeader label="Fake SNI Configuration" />
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box
                      sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                    >
                      <B4TextField
                        label="Add Fake SNI"
                        value={newFakeSni}
                        onChange={(e) => setNewFakeSni(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddFakeSni();
                          }
                        }}
                        placeholder="e.g., ya.ru, vk.com"
                        helperText="Additional SNI values to inject into ClientHello"
                      />
                      <B4PlusButton
                        onClick={handleAddFakeSni}
                        disabled={!newFakeSni.trim()}
                      />
                    </Box>
                  </Grid>
                  <B4ChipList
                    items={mutation.fake_snis || []}
                    getKey={(s) => s}
                    getLabel={(s) => s}
                    onDelete={handleRemoveFakeSni}
                    title="Active Fake SNIs"
                    gridSize={{ xs: 12, md: 6 }}
                  />
                </>
              )}
            </>
          )}
        </Grid>
      </B4Accordion>
    </Stack>
  );
};
