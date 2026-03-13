import { useState } from "react";
import { Box, Stack, Typography, Chip, Button } from "@mui/material";
import {
  Circle as CircleIcon,
  DeleteForever as ClearIcon,
} from "@mui/icons-material";
import { colors } from "@design";
import { B4Dialog } from "@common/B4Dialog";
import { useTranslation } from "react-i18next";
import type { Metrics } from "./Page";

interface HealthBannerProps {
  metrics: Metrics;
  connected: boolean;
  version: string | null;
}

type HealthLevel = "healthy" | "degraded" | "critical";

function deriveHealth(metrics: Metrics, connected: boolean): HealthLevel {
  if (!connected) return "critical";
  if (
    metrics.nfqueue_status === "unknown" ||
    metrics.tables_status === "unknown"
  )
    return "degraded";
  const activeWorkers = metrics.worker_status.filter(
    (w) => w.status === "active",
  ).length;
  if (activeWorkers === 0 && metrics.worker_status.length > 0)
    return "critical";
  if (activeWorkers < metrics.worker_status.length) return "degraded";
  return "healthy";
}

const healthColors: Record<HealthLevel, string> = {
  healthy: "#4caf50",
  degraded: "#ff9800",
  critical: "#f44336",
};

export const HealthBanner = ({
  metrics,
  connected,
  version,
}: HealthBannerProps) => {
  const { t } = useTranslation();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const health = deriveHealth(metrics, connected);
  const healthColor = healthColors[health] ?? "#f44336";
  const healthLabel = t(`dashboard.health.${health === "healthy" ? "running" : health}`);
  const activeWorkers = metrics.worker_status.filter(
    (w) => w.status === "active",
  ).length;
  const totalWorkers = metrics.worker_status.length;

  const handleReset = async () => {
    setResetOpen(false);
    setResetting(true);
    try {
      await fetch("/api/metrics/reset", { method: "POST" });
    } catch {
      // ignore — metrics will refresh via websocket
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          px: 2,
          py: 1,
          mb: 1.5,
          borderRadius: 1,
          bgcolor: colors.background.paper,
          border: `1px solid ${colors.border.default}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={0.5} alignItems="center">
            <CircleIcon sx={{ fontSize: 10, color: healthColor }} />
            <Typography
              variant="body2"
              sx={{ color: colors.text.primary, fontWeight: 600 }}
            >
              b4 {healthLabel}
            </Typography>
          </Stack>

          <Chip
            label={`${t("dashboard.health.nfqueue")}: ${metrics.nfqueue_status}`}
            size="small"
            sx={{
              bgcolor: `${healthColor}15`,
              color: colors.text.secondary,
              fontSize: "0.75rem",
              height: 24,
            }}
          />

          <Chip
            label={`${t("dashboard.health.firewall")}: ${metrics.tables_status}`}
            size="small"
            sx={{
              bgcolor: `${healthColor}15`,
              color: colors.text.secondary,
              fontSize: "0.75rem",
              height: 24,
            }}
          />

          <Chip
            label={`${t("dashboard.health.workers")}: ${activeWorkers}/${totalWorkers} ${t("dashboard.health.active")}`}
            size="small"
            sx={{
              bgcolor:
                activeWorkers === totalWorkers && totalWorkers > 0
                  ? "#4caf5015"
                  : "#ff980015",
              color: colors.text.secondary,
              fontSize: "0.75rem",
              height: 24,
            }}
          />

          <Typography variant="caption" sx={{ color: colors.text.secondary }}>
            {t("dashboard.health.uptime")}: {metrics.uptime}
          </Typography>

          {version && (
            <Typography variant="caption" sx={{ color: colors.text.disabled }}>
              v{version}
            </Typography>
          )}
        </Stack>

        <Button
          size="small"
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={() => setResetOpen(true)}
          disabled={resetting}
        >
          {resetting ? t("dashboard.health.resetting") : t("dashboard.health.resetStats")}
        </Button>
      </Box>

      <B4Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("dashboard.health.resetTitle")}
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => setResetOpen(false)}
              sx={{ color: colors.text.secondary }}
            >
              {t("core.cancel")}
            </Button>
            <Button
              onClick={() => void handleReset()}
              variant="contained"
              color="warning"
            >
              {t("dashboard.health.reset")}
            </Button>
          </Stack>
        }
      >
        <Typography sx={{ color: colors.text.primary, mt: 1 }}>
          {t("dashboard.health.resetConfirm")}
        </Typography>
      </B4Dialog>
    </>
  );
};
