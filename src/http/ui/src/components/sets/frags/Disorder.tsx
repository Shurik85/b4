import { Grid, Box, Typography } from "@mui/material";
import { B4SetConfig, DisorderShuffleMode } from "@models/config";
import {
  B4Alert,
  B4Slider,
  B4Switch,
  B4Select,
  B4FormHeader,
  B4TextField,
  B4PlusButton,
  B4ChipList,
} from "@b4.elements";
import { colors } from "@design";
import { useState } from "react";

const SEQ_OVERLAP_PRESETS = [
  { label: "None", value: "none", pattern: [] },
  {
    label: "TLS 1.2 Header",
    value: "tls12",
    pattern: ["16", "03", "03", "00", "00"],
  },
  {
    label: "TLS 1.1 Header",
    value: "tls11",
    pattern: ["16", "03", "02", "00", "00"],
  },
  {
    label: "TLS 1.0 Header",
    value: "tls10",
    pattern: ["16", "03", "01", "00", "00"],
  },
  {
    label: "HTTP GET",
    value: "http_get",
    pattern: ["47", "45", "54", "20", "2F"],
  },
  { label: "Zeros", value: "zeros", pattern: ["00"] },
  { label: "Custom", value: "custom", pattern: [] },
];

interface DisorderSettingsProps {
  config: B4SetConfig;
  onChange: (
    field: string,
    value: string | boolean | number | string[],
  ) => void;
}

const shuffleModeOptions: { label: string; value: DisorderShuffleMode }[] = [
  { label: "Full Shuffle", value: "full" },
  { label: "Reverse Order", value: "reverse" },
];

export const DisorderSettings = ({
  config,
  onChange,
}: DisorderSettingsProps) => {
  const disorder = config.fragmentation.disorder;
  const middleSni = config.fragmentation.middle_sni;

  const [customMode, setCustomMode] = useState(false);
  const [newByte, setNewByte] = useState("");
  const seqPattern = config.fragmentation.seq_overlap_pattern || [];

  const getCurrentPreset = () => {
    if (customMode) return "custom";
    if (seqPattern.length === 0) return "none";
    if (seqPattern.length === 0) return "custom";

    const match = SEQ_OVERLAP_PRESETS.find(
      (p) =>
        p.value !== "none" &&
        p.value !== "custom" &&
        p.pattern.length === seqPattern.length &&
        p.pattern.every((b, i) => b === seqPattern[i]),
    );
    return match?.value || "custom";
  };

  const handlePresetChange = (preset: string) => {
    if (preset === "none") {
      setCustomMode(false);
      onChange("fragmentation.seq_overlap_pattern", []);
      return;
    }

    if (preset === "custom") {
      onChange("fragmentation.seq_overlap_pattern", []);
      setCustomMode(true);

      return;
    }

    setCustomMode(false);
    const found = SEQ_OVERLAP_PRESETS.find((p) => p.value === preset);
    if (found) {
      onChange("fragmentation.seq_overlap_pattern", found.pattern);
    }
  };

  const handleAddByte = () => {
    const bytes = [] as string[];
    newByte.split(" ").forEach((b) => {
      const byte = b.trim().replace(/^0x/i, "").toUpperCase();
      if (/^[0-9A-F]{1,2}$/.test(byte)) {
        const padded = byte.padStart(2, "0");
        bytes.push(padded);
      }
    });
    onChange("fragmentation.seq_overlap_pattern", [...seqPattern, ...bytes]);
    setNewByte("");
  };

  const handleRemoveByte = (index: number) => {
    onChange(
      "fragmentation.seq_overlap_pattern",
      seqPattern.filter((_, i) => i !== index),
    );
  };

  return (
    <>
      <B4FormHeader label="Disorder Strategy" />
      <B4Alert sx={{ m: 0 }}>
        Disorder sends real TCP segments out of order with timing jitter. No
        fake packets — exploits DPI that expects sequential data.
      </B4Alert>

      {/* SNI Split Toggle */}
      <Grid size={{ xs: 12, md: 6 }}>
        <B4Switch
          label="SNI-Based Splitting"
          checked={middleSni}
          onChange={(checked: boolean) =>
            onChange("fragmentation.middle_sni", checked)
          }
          description="Split around SNI hostname for targeted disruption"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Select
          label="Shuffle Mode"
          value={disorder.shuffle_mode}
          options={shuffleModeOptions}
          onChange={(e) =>
            onChange(
              "fragmentation.disorder.shuffle_mode",
              e.target.value as string,
            )
          }
          helperText="How to reorder segments"
        />
      </Grid>

      {/* Visual */}
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
            SEGMENT ORDER EXAMPLE
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Box sx={{ display: "flex", gap: 0.5, fontFamily: "monospace" }}>
              {["①", "②", "③", "④"].map((n) => (
                <Box
                  key={n}
                  sx={{
                    p: 1,
                    bgcolor: colors.accent.primary,
                    borderRadius: 0.5,
                    minWidth: 32,
                    textAlign: "center",
                  }}
                >
                  {n}
                </Box>
              ))}
            </Box>
            <Typography sx={{ mx: 2 }}>→</Typography>
            <Box sx={{ display: "flex", gap: 0.5, fontFamily: "monospace" }}>
              {(disorder.shuffle_mode === "reverse"
                ? ["④", "③", "②", "①"]
                : ["③", "①", "④", "②"]
              ).map((n) => (
                <Box
                  key={n}
                  sx={{
                    p: 1,
                    bgcolor: colors.tertiary,
                    borderRadius: 0.5,
                    minWidth: 32,
                    textAlign: "center",
                  }}
                >
                  {n}
                </Box>
              ))}
            </Box>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: "block" }}
          >
            {disorder.shuffle_mode === "full"
              ? "Segments sent in random order (example shown)"
              : "Segments sent in reverse order"}
          </Typography>
        </Box>
      </Grid>

      <B4FormHeader label="Timing Jitter" sx={{ mb: 0 }} />
      <B4Alert sx={{ m: 0 }}>
        Random delay between segments. Used when TCP Seg2Delay is 0.
      </B4Alert>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label="Min Jitter"
          value={disorder.min_jitter_us}
          onChange={(value: number) =>
            onChange("fragmentation.disorder.min_jitter_us", value)
          }
          min={100}
          max={5000}
          step={100}
          helperText="Minimum delay between segments (μs)"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label="Max Jitter"
          value={disorder.max_jitter_us}
          onChange={(value: number) =>
            onChange("fragmentation.disorder.max_jitter_us", value)
          }
          min={500}
          max={10000}
          step={100}
          helperText="Maximum delay between segments (μs)"
        />
      </Grid>

      {disorder.min_jitter_us >= disorder.max_jitter_us && (
        <B4Alert severity="warning">
          Max jitter should be greater than min jitter for random variation.
        </B4Alert>
      )}

      <B4FormHeader label="Fake Per Segment (multidisorder)" />

      <Grid size={{ xs: 12 }}>
        <B4Alert severity="info">
          Multidisorder: sends fake overlap packets before each real segment,
          not just the first. Floods DPI reassembly with garbage.
        </B4Alert>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Switch
          label="Fake Per Segment"
          checked={disorder.fake_per_segment}
          onChange={(checked: boolean) =>
            onChange("fragmentation.disorder.fake_per_segment", checked)
          }
          description="Send fake overlap before every segment"
        />
      </Grid>

      {disorder.fake_per_segment && (
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Slider
            label="Fakes Per Segment"
            value={disorder.fake_per_seg_count || 1}
            onChange={(value: number) =>
              onChange("fragmentation.disorder.fake_per_seg_count", value)
            }
            min={1}
            max={11}
            step={1}
            helperText="Number of fake packets before each segment"
          />
        </Grid>
      )}

      <B4FormHeader label="Sequence Overlap (seqovl)" />

      <B4Alert sx={{ m: 0 }}>
        Prepends fake bytes with decreased TCP sequence number. DPI sees fake
        protocol header, server discards overlap.
      </B4Alert>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Select
          label="Overlap Pattern"
          value={getCurrentPreset()}
          options={SEQ_OVERLAP_PRESETS.map((p) => ({
            label: p.label,
            value: p.value,
          }))}
          onChange={(e) => handlePresetChange(e.target.value as string)}
          helperText="Fake bytes DPI will see"
        />
      </Grid>
      {seqPattern.length > 0 && (
        <Grid size={{ xs: 6 }}>
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
              SEQOVL VISUALIZATION
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                alignItems: "center",
              }}
            >
              <Box
                sx={{
                  p: 1,
                  bgcolor: colors.tertiary,
                  borderRadius: 0.5,
                  border: `2px dashed ${colors.secondary}`,
                }}
              >
                [{seqPattern.join(" ")}] (fake, seq-
                {seqPattern.length})
              </Box>
              <Typography sx={{ mx: 1 }}>+</Typography>
              <Box
                sx={{
                  p: 1,
                  bgcolor: colors.accent.secondary,
                  borderRadius: 0.5,
                  flex: 1,
                }}
              >
                Real TLS ClientHello...
              </Box>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: "block" }}
            >
              DPI sees fake header at decreased seq#, server reassembles
              correctly
            </Typography>
          </Box>
        </Grid>
      )}
      {getCurrentPreset() === "custom" && (
        <>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <B4TextField
                label="Add Byte (hex)"
                value={newByte}
                onChange={(e) => setNewByte(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="e.g., 16 or 0x16"
                size="small"
              />
              <B4PlusButton
                onClick={handleAddByte}
                disabled={!newByte.trim()}
              />
            </Box>
          </Grid>

          <B4ChipList
            items={seqPattern.map((b, i) => ({ byte: b, index: i }))}
            getKey={(item) => `${item.byte}-${item.index}`}
            getLabel={(item) => `0x${item.byte}`}
            onDelete={(item) => handleRemoveByte(item.index)}
            emptyMessage="Add hex bytes for custom pattern"
            gridSize={{ xs: 12, md: 6 }}
            showEmpty
          />
        </>
      )}
    </>
  );
};
