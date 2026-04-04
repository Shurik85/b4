import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Link as RouterLink } from "react-router";
import {
  Chip,
  IconButton,
  Link,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  WatchdogIcon,
  RefreshIcon,
  DeleteIcon,
  StartIcon,
  AddIcon,
  SuccessIcon,
  WarningIcon,
  ErrorIcon,
  TimerIcon,
} from "@b4.icons";
import { colors } from "@design";
import { B4Section, B4Alert } from "@b4.elements";
import { useWatchdog } from "@hooks/useWatchdog";
import { WatchdogDomainStatus } from "@models/watchdog";

function statusColor(status: string): "success" | "warning" | "error" | "info" {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "escalating":
      return "info";
    case "queued":
      return "info";
    default:
      return "info";
  }
}

function StatusIcon({ status }: Readonly<{ status: string }>) {
  switch (status) {
    case "healthy":
      return <SuccessIcon sx={{ fontSize: 18, color: "#4caf50" }} />;
    case "degraded":
      return <WarningIcon sx={{ fontSize: 18, color: "#ff9800" }} />;
    case "escalating":
      return <TimerIcon sx={{ fontSize: 18, color: "#2196f3" }} />;
    default:
      return <ErrorIcon sx={{ fontSize: 18, color: "#f44336" }} />;
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso || iso === "0001-01-01T00:00:00Z") return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleString();
}

function DomainRow({
  domain,
  onForceCheck,
  onRemove,
}: Readonly<{
  domain: WatchdogDomainStatus;
  onForceCheck: (d: string) => void;
  onRemove: (d: string) => void;
}>) {
  const { t } = useTranslation();
  const isEscalating = domain.status === "escalating";

  return (
    <TableRow
      sx={{
        "&:last-child td, &:last-child th": { border: 0 },
        opacity: isEscalating ? 0.8 : 1,
      }}
    >
      <TableCell>
        <Tooltip title={domain.domain === domain.display_domain ? "" : domain.domain}>
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusIcon status={domain.status} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {domain.display_domain || domain.domain}
            </Typography>
          </Stack>
        </Tooltip>
      </TableCell>
      <TableCell>
        {domain.matched_set ? (
          <Chip label={domain.matched_set} size="small" variant="outlined" />
        ) : (
          <Typography variant="body2" color="text.secondary">-</Typography>
        )}
      </TableCell>
      <TableCell>
        <Chip
          label={t(`watchdog.status.${domain.status}`)}
          color={statusColor(domain.status)}
          size="small"
          variant="outlined"
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {formatTime(domain.last_check)}
        </Typography>
      </TableCell>
      <TableCell>
        {domain.consecutive_failures > 0 ? (
          <Chip
            label={`${domain.consecutive_failures}`}
            color="warning"
            size="small"
            variant="outlined"
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            0
          </Typography>
        )}
      </TableCell>
      <TableCell>
        {domain.last_error ? (
          <Tooltip title={domain.last_error}>
            <Chip
              label={domain.last_error}
              color="error"
              size="small"
              variant="outlined"
              sx={{ maxWidth: 250 }}
            />
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.secondary">-</Typography>
        )}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title={t("watchdog.forceCheck")}>
            <span>
              <IconButton
                size="small"
                onClick={() => onForceCheck(domain.domain)}
                disabled={isEscalating}
              >
                <StartIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("watchdog.removeDomain")}>
            <IconButton
              size="small"
              onClick={() => onRemove(domain.domain)}
              color="error"
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

export function WatchdogMonitor() {
  const { t } = useTranslation();
  const { state, loading, forceCheck, addDomain, removeDomain, toggleEnabled, refresh } =
    useWatchdog();
  const [newDomain, setNewDomain] = useState("");

  const handleRefresh = () => {
    refresh().catch(() => {});
  };

  const handleAddDomain = () => {
    const domain = newDomain.trim();
    if (!domain) return;
    addDomain(domain)
      .then(() => setNewDomain(""))
      .catch(() => {});
  };

  if (loading || !state) {
    return null;
  }

  const domains = state.domains ?? [];
  const healthyCount = domains.filter((d) => d.status === "healthy").length;
  const degradedCount = domains.filter((d) => d.status !== "healthy").length;

  return (
    <B4Section
      title={t("watchdog.title")}
      description={t("watchdog.description")}
      icon={<WatchdogIcon />}
    >
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={state.enabled ? t("watchdog.enabled") : t("watchdog.disabled")}
              color={state.enabled ? "success" : "default"}
              size="small"
              onClick={() => toggleEnabled(!state.enabled)}
              sx={{ cursor: "pointer" }}
            />
            {state.enabled && domains.length > 0 && (
              <>
                <Chip
                  label={`${healthyCount} ${t("watchdog.status.healthy")}`}
                  color="success"
                  size="small"
                  variant="outlined"
                />
                {degradedCount > 0 && (
                  <Chip
                    label={`${degradedCount} ${t("watchdog.issues")}`}
                    color="warning"
                    size="small"
                    variant="outlined"
                  />
                )}
              </>
            )}
          </Stack>
          <IconButton onClick={handleRefresh} size="small">
            <RefreshIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Stack>

        {!state.enabled && (
          <B4Alert severity="info">
            <Trans
              i18nKey="watchdog.disabledHint"
              components={{ link: <Link component={RouterLink} to="/settings/discovery" /> }}
            />
          </B4Alert>
        )}

        {state.enabled && (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddDomain();
                }
              }}
              placeholder={t("watchdog.addPlaceholder")}
              sx={{ flex: 1, maxWidth: 400 }}
            />
            <IconButton
              onClick={handleAddDomain}
              disabled={!newDomain.trim()}
              sx={{
                bgcolor: colors.accent.secondary,
                color: colors.secondary,
                "&:hover": { bgcolor: colors.accent.secondaryHover },
              }}
            >
              <AddIcon />
            </IconButton>
          </Stack>
        )}

        {state.enabled && domains.length === 0 && (
          <B4Alert severity="info">
            <Trans
              i18nKey="watchdog.noDomainsHint"
              components={{ link: <Link component={RouterLink} to="/settings/discovery" /> }}
            />
          </B4Alert>
        )}

        {domains.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("watchdog.table.domain")}</TableCell>
                  <TableCell>{t("watchdog.table.set")}</TableCell>
                  <TableCell>{t("watchdog.table.status")}</TableCell>
                  <TableCell>{t("watchdog.table.lastCheck")}</TableCell>
                  <TableCell>{t("watchdog.table.failures")}</TableCell>
                  <TableCell>{t("watchdog.table.error")}</TableCell>
                  <TableCell align="right">{t("watchdog.table.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {domains.map((domain) => (
                  <DomainRow
                    key={domain.domain}
                    domain={domain}
                    onForceCheck={forceCheck}
                    onRemove={removeDomain}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </B4Section>
  );
}
