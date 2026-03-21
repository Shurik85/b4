import { Grid, Box, Typography } from "@mui/material";
import { B4SetConfig, DisorderShuffleMode } from "@models/config";
import {
  B4Alert,
  B4Slider,
  B4RangeSlider,
  B4Switch,
  B4Select,
  B4FormHeader,
  B4TextField,
  B4PlusButton,
  B4ChipList,
} from "@b4.elements";
import { colors } from "@design";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface DisorderSettingsProps {
  config: B4SetConfig;
  onChange: (
    field: string,
    value: string | boolean | number | string[],
  ) => void;
}

export const DisorderSettings = ({
  config,
  onChange,
}: DisorderSettingsProps) => {
  const { t } = useTranslation();
  const disorder = config.fragmentation.disorder;
  const middleSni = config.fragmentation.middle_sni;

  const SEQ_OVERLAP_PRESETS = [
    { label: t("sets.tcp.splitting.disorder.presetNone"), value: "none", pattern: [] },
    {
      label: t("sets.tcp.splitting.disorder.presetTls12"),
      value: "tls12",
      pattern: ["16", "03", "03", "00", "00"],
    },
    {
      label: t("sets.tcp.splitting.disorder.presetTls11"),
      value: "tls11",
      pattern: ["16", "03", "02", "00", "00"],
    },
    {
      label: t("sets.tcp.splitting.disorder.presetTls10"),
      value: "tls10",
      pattern: ["16", "03", "01", "00", "00"],
    },
    {
      label: t("sets.tcp.splitting.disorder.presetHttpGet"),
      value: "http_get",
      pattern: ["47", "45", "54", "20", "2F"],
    },
    { label: t("sets.tcp.splitting.disorder.presetZeros"), value: "zeros", pattern: ["00"] },
    { label: t("sets.tcp.splitting.disorder.presetCustom"), value: "custom", pattern: [] },
  ];

  const shuffleModeOptions: { label: string; value: DisorderShuffleMode }[] = [
    { label: t("sets.tcp.splitting.disorder.shuffleFull"), value: "full" },
    { label: t("sets.tcp.splitting.disorder.shuffleReverse"), value: "reverse" },
  ];

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
      <B4FormHeader label={t("sets.tcp.splitting.disorder.header")} />
      <B4Alert sx={{ m: 0 }}>
        {t("sets.tcp.splitting.disorder.alert")}
      </B4Alert>

      {/* SNI Split Toggle */}
      <Grid size={{ xs: 12, md: 6 }}>
        <B4Switch
          label={t("sets.tcp.splitting.disorder.sniSplit")}
          checked={middleSni}
          onChange={(checked: boolean) =>
            onChange("fragmentation.middle_sni", checked)
          }
          description={t("sets.tcp.splitting.disorder.sniSplitDesc")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Select
          label={t("sets.tcp.splitting.disorder.shuffleMode")}
          value={disorder.shuffle_mode}
          options={shuffleModeOptions}
          onChange={(e) =>
            onChange(
              "fragmentation.disorder.shuffle_mode",
              e.target.value as string,
            )
          }
          helperText={t("sets.tcp.splitting.disorder.shuffleHelper")}
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
            {t("sets.tcp.splitting.disorder.segOrderExample")}
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
              ? t("sets.tcp.splitting.disorder.segRandomOrder")
              : t("sets.tcp.splitting.disorder.segReverseOrder")}
          </Typography>
        </Box>
      </Grid>

      <B4FormHeader label={t("sets.tcp.splitting.disorder.timingHeader")} sx={{ mb: 0 }} />
      <B4Alert sx={{ m: 0 }}>
        {t("sets.tcp.splitting.disorder.timingAlert")}
      </B4Alert>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label={t("sets.tcp.splitting.disorder.minJitter")}
          value={disorder.min_jitter_us}
          onChange={(value: number) =>
            onChange("fragmentation.disorder.min_jitter_us", value)
          }
          min={100}
          max={5000}
          step={100}
          helperText={t("sets.tcp.splitting.disorder.minJitterHelper")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label={t("sets.tcp.splitting.disorder.maxJitter")}
          value={disorder.max_jitter_us}
          onChange={(value: number) =>
            onChange("fragmentation.disorder.max_jitter_us", value)
          }
          min={500}
          max={10000}
          step={100}
          helperText={t("sets.tcp.splitting.disorder.maxJitterHelper")}
        />
      </Grid>

      {disorder.min_jitter_us >= disorder.max_jitter_us && (
        <B4Alert severity="warning">
          {t("sets.tcp.splitting.disorder.jitterWarning")}
        </B4Alert>
      )}

      <B4FormHeader label={t("sets.tcp.splitting.disorder.fakePerSegHeader")} />

      <Grid size={{ xs: 12 }}>
        <B4Alert severity="info">
          {t("sets.tcp.splitting.disorder.fakePerSegAlert")}
        </B4Alert>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Switch
          label={t("sets.tcp.splitting.disorder.fakePerSeg")}
          checked={disorder.fake_per_segment}
          onChange={(checked: boolean) =>
            onChange("fragmentation.disorder.fake_per_segment", checked)
          }
          description={t("sets.tcp.splitting.disorder.fakePerSegDesc")}
        />
      </Grid>

      {disorder.fake_per_segment && (
        <Grid size={{ xs: 12, md: 6 }}>
          <B4RangeSlider
            label={t("sets.tcp.splitting.disorder.fakesPerSeg")}
            value={[
              disorder.fake_per_seg_count || 1,
              disorder.fake_per_seg_count_max || disorder.fake_per_seg_count || 1,
            ]}
            onChange={(value: [number, number]) => {
              onChange("fragmentation.disorder.fake_per_seg_count", value[0]);
              onChange("fragmentation.disorder.fake_per_seg_count_max", value[1]);
            }}
            min={1}
            max={11}
            step={1}
            helperText={t("sets.tcp.splitting.disorder.fakesPerSegHelper")}
          />
        </Grid>
      )}

      <B4FormHeader label={t("sets.tcp.splitting.disorder.seqOverlapHeader")} />

      <B4Alert sx={{ m: 0 }}>
        {t("sets.tcp.splitting.disorder.seqOverlapAlert")}
      </B4Alert>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Select
          label={t("sets.tcp.splitting.disorder.overlapPattern")}
          value={getCurrentPreset()}
          options={SEQ_OVERLAP_PRESETS.map((p) => ({
            label: p.label,
            value: p.value,
          }))}
          onChange={(e) => handlePresetChange(e.target.value as string)}
          helperText={t("sets.tcp.splitting.disorder.overlapPatternHelper")}
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
              {t("sets.tcp.splitting.disorder.seqovlViz")}
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
                {t("sets.tcp.splitting.disorder.seqovlReal")}
              </Box>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: "block" }}
            >
              {t("sets.tcp.splitting.disorder.seqovlNote")}
            </Typography>
          </Box>
        </Grid>
      )}
      {getCurrentPreset() === "custom" && (
        <>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <B4TextField
                label={t("sets.tcp.splitting.disorder.addByteLabel")}
                value={newByte}
                onChange={(e) => setNewByte(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder={t("sets.tcp.splitting.disorder.addBytePlaceholder")}
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
            emptyMessage={t("sets.tcp.splitting.disorder.addByteEmpty")}
            gridSize={{ xs: 12, md: 6 }}
            showEmpty
          />
        </>
      )}
    </>
  );
};
