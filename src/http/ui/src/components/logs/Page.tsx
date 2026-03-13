import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Container,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ClearIcon } from "@b4.icons";
import { B4Badge, B4TextField, B4Switch, B4TooltipButton } from "@b4.elements";
import { ArrowDownIcon } from "@b4.icons";
import { useWebSocket } from "@context/B4WsProvider";
import { useSnackbar } from "@context/SnackbarProvider";
import { useTranslation } from "react-i18next";

export function LogsPage() {
  const { t } = useTranslation();
  const { showSuccess } = useSnackbar();
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const { logs, pauseLogs, setPauseLogs, clearLogs } = useWebSocket();

  useEffect(() => {
    const el = logRef.current;
    if (el && autoScroll) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = logRef.current;
    if (el) {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      setAutoScroll(isAtBottom);
      setShowScrollBtn(!isAtBottom);
    }
  };

  const scrollToBottom = () => {
    const el = logRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setAutoScroll(true);
      setShowScrollBtn(false);
    }
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? logs.filter((l) => l.toLowerCase().includes(f)) : logs;
  }, [logs, filter]);

  const handleHotkeysDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey && e.key === "x") || e.key === "Delete") {
        e.preventDefault();
        clearLogs();
        showSuccess(t("logs.cleared"));
      } else if (e.key === "p" || e.key === "Pause") {
        e.preventDefault();
        setPauseLogs(!pauseLogs);
        showSuccess(!pauseLogs ? t("logs.paused") : t("logs.resumed"));
      }
    },
    [clearLogs, pauseLogs, setPauseLogs, showSuccess]
  );

  useEffect(() => {
    globalThis.window.addEventListener("keydown", handleHotkeysDown);
    return () => {
      globalThis.window.removeEventListener("keydown", handleHotkeysDown);
    };
  }, [handleHotkeysDown]);

  return (
    <Container
      maxWidth={false}
      sx={{
        flex: 1,
        py: 3,
        px: 3,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid",
          borderColor: pauseLogs
            ? "rgba(245, 173, 24, 0.5)"
            : "rgba(245, 173, 24, 0.24)",
          transition: "border-color 0.3s",
        }}
      >
        {/* Controls Bar */}
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "rgba(245, 173, 24, 0.12)",
            bgcolor: "rgba(31, 18, 24, 0.6)",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <B4TextField
              size="small"
              placeholder={t("logs.filterPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <B4Badge label={t("core.lines", { count: logs.length })} size="small" />
              {filter && (
                <B4Badge label={t("core.filtered", { count: filtered.length })} size="small" />
              )}
            </Stack>
            <B4Switch
              label={pauseLogs ? t("logs.pausedLabel") : t("logs.streamingLabel")}
              checked={pauseLogs}
              onChange={(checked: boolean) => setPauseLogs(checked)}
            />
            <B4TooltipButton
              title={t("logs.clearLogs")}
              onClick={clearLogs}
              icon={<ClearIcon />}
            />
          </Stack>
        </Box>

        <Box
          ref={logRef}
          onScroll={handleScroll}
          sx={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            p: 2,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            backgroundColor: "#0f0a0e",
            color: "text.primary",
          }}
        >
          {(() => {
            if (filtered.length === 0 && logs.length === 0) {
              return (
                <Typography
                  sx={{
                    color: "text.secondary",
                    textAlign: "center",
                    mt: 4,
                    fontStyle: "italic",
                  }}
                >
                  {t("logs.waitingForLogs")}
                </Typography>
              );
            } else if (filtered.length === 0) {
              return (
                <Typography
                  sx={{
                    color: "text.secondary",
                    textAlign: "center",
                    mt: 4,
                    fontStyle: "italic",
                  }}
                >
                  {t("logs.noMatch")}
                </Typography>
              );
            } else {
              return filtered.map((l, i) => (
                <Typography
                  key={l + "_" + i}
                  component="div"
                  sx={{
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    "&:hover": {
                      bgcolor: "rgba(158, 28, 96, 0.1)",
                    },
                  }}
                >
                  {l}
                </Typography>
              ));
            }
          })()}

          {/* Scroll to Bottom Button */}
          {showScrollBtn && (
            <IconButton
              onClick={scrollToBottom}
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                bgcolor: "#9E1C60",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(158, 28, 96, 0.4)",
                "&:hover": {
                  bgcolor: "#811844",
                },
              }}
              size="small"
            >
              <ArrowDownIcon />
            </IconButton>
          )}
        </Box>
      </Paper>
    </Container>
  );
}
