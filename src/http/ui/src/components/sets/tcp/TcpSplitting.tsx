import { Grid, Typography, Box } from "@mui/material";
import {
  B4Switch,
  B4Select,
  B4Slider,
  B4Alert,
  B4FormHeader,
} from "@b4.elements";
import { B4SetConfig, FragmentationStrategy } from "@models/config";
import { ComboSettings } from "../frags/Combo";
import { DisorderSettings } from "../frags/Disorder";
import { ExtSplitSettings } from "../frags/ExtSplit";
import { FirstByteSettings } from "../frags/FirstByte";
import { TcpIpSettings } from "../frags/TcpIp";
import { useTranslation } from "react-i18next";

interface TcpSplittingProps {
  config: B4SetConfig;
  onChange: (
    field: string,
    value: string | boolean | number | string[],
  ) => void;
}

export const TcpSplitting = ({ config, onChange }: TcpSplittingProps) => {
  const { t } = useTranslation();
  const strategy = config.fragmentation.strategy;
  const isTcpOrIp = strategy === "tcp" || strategy === "ip";
  const isOob = strategy === "oob";
  const isTls = strategy === "tls";
  const isActive = strategy !== "none";

  const fragmentationOptions: { label: string; value: FragmentationStrategy }[] =
    [
      { label: t("sets.tcp.splitting.strategyCombo"), value: "combo" },
      { label: t("sets.tcp.splitting.strategyHybrid"), value: "hybrid" },
      { label: t("sets.tcp.splitting.strategyDisorder"), value: "disorder" },
      { label: t("sets.tcp.splitting.strategyExtSplit"), value: "extsplit" },
      { label: t("sets.tcp.splitting.strategyFirstByte"), value: "firstbyte" },
      { label: t("sets.tcp.splitting.strategyTcp"), value: "tcp" },
      { label: t("sets.tcp.splitting.strategyIp"), value: "ip" },
      { label: t("sets.tcp.splitting.strategyTls"), value: "tls" },
      { label: t("sets.tcp.splitting.strategyOob"), value: "oob" },
      { label: t("sets.tcp.splitting.strategyNone"), value: "none" },
    ];

  return (
    <>
      <B4FormHeader label={t("sets.tcp.splitting.header")} />
      <Grid container spacing={3}>
        {/* Strategy Selection */}
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Select
            label={t("sets.tcp.splitting.method")}
            value={strategy}
            options={fragmentationOptions}
            onChange={(e) =>
              onChange("fragmentation.strategy", e.target.value as string)
            }
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4Switch
            label={t("sets.tcp.splitting.reverseOrder")}
            checked={config.fragmentation.reverse_order}
            onChange={(checked: boolean) =>
              onChange("fragmentation.reverse_order", checked)
            }
            description={t("sets.tcp.splitting.reverseOrderDesc")}
          />
        </Grid>

        {isTcpOrIp && <TcpIpSettings config={config} onChange={onChange} />}

        {strategy === "combo" && (
          <ComboSettings config={config} onChange={onChange} />
        )}

        {strategy === "disorder" && (
          <DisorderSettings config={config} onChange={onChange} />
        )}
        {strategy === "extsplit" && <ExtSplitSettings />}

        {strategy === "firstbyte" && <FirstByteSettings config={config} />}

        {isOob && (
          <>
            <B4FormHeader label={t("sets.tcp.splitting.oobHeader")} />

            <B4Alert>
              {t("sets.tcp.splitting.oobAlert")}
            </B4Alert>

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label={t("sets.tcp.splitting.oobPosition")}
                value={config.fragmentation.oob_position || 1}
                onChange={(value: number) =>
                  onChange("fragmentation.oob_position", value)
                }
                min={1}
                max={50}
                step={1}
                helperText={t("sets.tcp.splitting.oobPositionHelper")}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Box>
                <Typography variant="body2" gutterBottom>
                  {t("sets.tcp.splitting.oobByte")}{" "}
                  <code>
                    {String.fromCharCode(config.fragmentation.oob_char || 120)}
                  </code>{" "}
                  (0x
                  {(config.fragmentation.oob_char || 120)
                    .toString(16)
                    .padStart(2, "0")}
                  )
                </Typography>
              </Box>
            </Grid>
          </>
        )}

        {/* TLS Record Settings */}
        {isTls && (
          <>
            <B4FormHeader label={t("sets.tcp.splitting.tlsRecHeader")} />

            <B4Alert>
              {t("sets.tcp.splitting.tlsRecAlert")}
            </B4Alert>

            <Grid size={{ xs: 12, md: 6 }}>
              <B4Slider
                label={t("sets.tcp.splitting.tlsRecPosition")}
                value={config.fragmentation.tlsrec_pos || 1}
                onChange={(value: number) =>
                  onChange("fragmentation.tlsrec_pos", value)
                }
                min={1}
                max={100}
                step={1}
                helperText={t("sets.tcp.splitting.tlsRecPositionHelper")}
              />
            </Grid>
          </>
        )}

        {!isActive && (
          <B4Alert severity="warning">
            {t("sets.tcp.splitting.disabledWarning")}
          </B4Alert>
        )}
      </Grid>
    </>
  );
};
