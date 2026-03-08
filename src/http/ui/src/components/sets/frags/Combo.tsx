import { Grid, Box, Typography } from "@mui/material";
import { B4Slider, B4Switch, B4Select } from "@b4.fields";
import { B4SetConfig, ComboShuffleMode } from "@models/config";
import { colors } from "@design";
import { B4Alert, B4FormHeader } from "@b4.elements";

interface ComboSettingsProps {
  config: B4SetConfig;
  onChange: (
    field: string,
    value: string | boolean | number | string[],
  ) => void;
}

const shuffleModeOptions: { label: string; value: ComboShuffleMode }[] = [
  { label: "Middle Only", value: "middle" },
  { label: "Full Shuffle", value: "full" },
  { label: "Reverse Order", value: "reverse" },
];

export const ComboSettings = ({ config, onChange }: ComboSettingsProps) => {
  const combo = config.fragmentation.combo;
  const middleSni = config.fragmentation.middle_sni;

  const enabledSplits = [
    combo.first_byte_split && "1st byte",
    combo.extension_split && "ext",
    middleSni && "SNI",
  ].filter(Boolean);

  return (
    <>
      <B4FormHeader label="Combo Strategy" />

      <Grid size={{ xs: 12 }}>
        <B4Alert severity="info">
          Combo combines multiple split points and sends segments out of order
          with timing jitter to confuse stateful DPI.
        </B4Alert>
      </Grid>

      {/* Decoy Settings */}
      <B4FormHeader label="Decoy Packet" />

      <Grid size={{ xs: 12 }}>
        <B4Switch
          label="Enable Decoy"
          checked={combo.decoy_enabled}
          onChange={(checked: boolean) =>
            onChange("fragmentation.combo.decoy_enabled", checked)
          }
          description="Send fake ClientHello with whitelisted SNI before real traffic"
        />
      </Grid>

      {combo.decoy_enabled && (
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
              HOW DECOY WORKS
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ minWidth: 80, color: colors.text.secondary }}
                >
                  Sent 1st:
                </Typography>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: colors.tertiary,
                    borderRadius: 0.5,
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                    border: `2px dashed ${colors.secondary}`,
                  }}
                >
                  FAKE payload (low TTL)
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: colors.secondary, ml: 1 }}
                >
                  → DPI sees, dies before server
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ minWidth: 80, color: colors.text.secondary }}
                >
                  Sent 2nd:
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      bgcolor: colors.accent.secondary,
                      borderRadius: 0.5,
                      border: `2px solid ${colors.secondary}`,
                    }}
                  >
                    REAL (fragmented)
                  </Box>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: colors.secondary, ml: 1 }}
                >
                  → Server receives
                </Typography>
              </Box>
            </Box>
          </Box>
        </Grid>
      )}

      {/* Split Points */}
      <B4FormHeader label="Split Points" />

      <Grid size={{ xs: 12, md: 4 }}>
        <B4Switch
          label="First Byte"
          checked={combo.first_byte_split}
          onChange={(checked: boolean) =>
            onChange("fragmentation.combo.first_byte_split", checked)
          }
          description="Split after 1st byte (timing desync)"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <B4Switch
          label="Extension Split"
          checked={combo.extension_split}
          onChange={(checked: boolean) =>
            onChange("fragmentation.combo.extension_split", checked)
          }
          description="Split before SNI extension"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <B4Switch
          label="SNI Split"
          checked={middleSni}
          onChange={(checked: boolean) =>
            onChange("fragmentation.middle_sni", checked)
          }
          description="Split in middle of SNI hostname"
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
            SEGMENT VISUALIZATION
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 0.5,
              fontFamily: "monospace",
              fontSize: "0.7rem",
              flexWrap: "wrap",
            }}
          >
            {combo.first_byte_split && (
              <Box
                sx={{
                  p: 1,
                  bgcolor: colors.tertiary,
                  borderRadius: 0.5,
                  textAlign: "center",
                  minWidth: 40,
                }}
              >
                1B
              </Box>
            )}
            {combo.extension_split && (
              <Box
                sx={{
                  p: 1,
                  bgcolor: colors.accent.primary,
                  borderRadius: 0.5,
                  textAlign: "center",
                  flex: 1,
                  minWidth: 60,
                }}
              >
                Pre-SNI Ext
              </Box>
            )}
            {middleSni && (
              <>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: colors.accent.secondary,
                    borderRadius: 0.5,
                    textAlign: "center",
                    minWidth: 50,
                  }}
                >
                  SNI₁
                </Box>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: colors.accent.secondary,
                    borderRadius: 0.5,
                    textAlign: "center",
                    minWidth: 50,
                  }}
                >
                  SNI₂
                </Box>
              </>
            )}
            <Box
              sx={{
                p: 1,
                bgcolor: colors.quaternary,
                borderRadius: 0.5,
                textAlign: "center",
                flex: 1,
                minWidth: 60,
              }}
            >
              Rest...
            </Box>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: "block" }}
          >
            {enabledSplits.length > 0
              ? `Active splits: ${enabledSplits.join(" → ")} → creates ${
                  enabledSplits.length + 1
                } segments`
              : "No splits enabled - packet sent as single segment"}
          </Typography>
        </Box>
      </Grid>

      {/* Shuffle Mode */}
      <Grid size={{ xs: 12, md: 6 }}>
        <B4Select
          label="Shuffle Mode"
          value={combo.shuffle_mode}
          options={shuffleModeOptions}
          onChange={(e) =>
            onChange(
              "fragmentation.combo.shuffle_mode",
              e.target.value as string,
            )
          }
          helperText="How to reorder segments before sending"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Alert sx={{ my: 0 }}>
          {combo.shuffle_mode === "middle" &&
            "Middle: Keep first & last in place, shuffle middle segments"}
          {combo.shuffle_mode === "full" &&
            "Full: Randomly shuffle all segments"}
          {combo.shuffle_mode === "reverse" &&
            "Reverse: Send segments in reverse order"}
        </B4Alert>
      </Grid>

      <B4FormHeader label="Timing Settings" />

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label="First Segment Delay"
          value={combo.first_delay_ms}
          onChange={(value: number) =>
            onChange("fragmentation.combo.first_delay_ms", value)
          }
          min={10}
          max={500}
          step={10}
          helperText="Delay after first segment (ms)"
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Slider
          label="Jitter Max"
          value={combo.jitter_max_us}
          onChange={(value: number) =>
            onChange("fragmentation.combo.jitter_max_us", value)
          }
          min={100}
          max={10000}
          step={100}
          helperText="Max random delay between other segments (μs)"
        />
      </Grid>

      <B4FormHeader label="Fake Per Segment (multidisorder)" />

      <Grid size={{ xs: 12 }}>
        <B4Alert severity="info">
          sends fake overlap packets before each real segment, not just the
          first. Floods DPI reassembly with garbage.
        </B4Alert>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <B4Switch
          label="Fake Per Segment"
          checked={combo.fake_per_segment}
          onChange={(checked: boolean) =>
            onChange("fragmentation.combo.fake_per_segment", checked)
          }
          description="Send fake overlap before every segment"
        />
      </Grid>

      {combo.fake_per_segment && (
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Slider
            label="Fakes Per Segment"
            value={combo.fake_per_seg_count || 1}
            onChange={(value: number) =>
              onChange("fragmentation.combo.fake_per_seg_count", value)
            }
            min={1}
            max={11}
            step={1}
            helperText="Number of fake packets before each segment"
          />
        </Grid>
      )}

      {!combo.first_byte_split && !combo.extension_split && !middleSni && (
        <B4Alert severity="warning">
          No split points enabled. Enable at least one for Combo to work
          effectively.
        </B4Alert>
      )}
    </>
  );
};
