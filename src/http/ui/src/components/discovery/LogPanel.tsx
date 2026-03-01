import { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Typography,
  Stack,
  Tooltip,
  Paper,
  Button,
} from "@mui/material";
import {
  ExpandIcon,
  CollapseIcon,
  ClearIcon,
  LogsIcon,
  FullscreenIcon,
  CloseIcon,
} from "@b4.icons";
import { colors } from "@design";
import { useDiscoveryLogs } from "@b4.discovery";
import { B4Badge } from "@b4.elements";
import { B4Dialog } from "@common/B4Dialog";

interface DiscoveryLogPanelProps {
  running: boolean;
}

export const DiscoveryLogPanel = ({ running }: DiscoveryLogPanelProps) => {
  const { logs, connected, clearLogs } = useDiscoveryLogs();
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const hasAutoExpanded = useRef(false);

  useEffect(() => {
    if (running && logs.length > 0 && !hasAutoExpanded.current) {
      setExpanded(true);
      hasAutoExpanded.current = true;
    }
    if (!running) {
      hasAutoExpanded.current = false;
    }
  }, [running, logs.length]);

  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  useEffect(() => {
    if (modalScrollRef.current && modalOpen) {
      modalScrollRef.current.scrollTop = modalScrollRef.current.scrollHeight;
    }
  }, [logs, modalOpen]);

  if (!running && logs.length === 0) return null;

  const logContent = (height: number | string, ref: React.RefObject<HTMLDivElement | null>) => (
    <div
      ref={ref}
      style={{
        height,
        overflowY: "auto",
        backgroundColor: colors.background.dark,
        fontFamily: "monospace",
        fontSize: 12,
        padding: 16,
      }}
    >
      {logs.length === 0 ? (
        <Typography
          sx={{ color: colors.text.disabled, fontStyle: "italic" }}
        >
          Waiting for discovery logs...
        </Typography>
      ) : (
        logs.map((line, i) => (
          <div
            key={i}
            style={{
              color: getLogColor(line),
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.6,
            }}
          >
            {line}
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          bgcolor: colors.background.paper,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            p: 2,
            bgcolor: colors.accent.primary,
            cursor: "pointer",
          }}
          onClick={() => setExpanded((e) => !e)}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <LogsIcon sx={{ fontSize: 20, color: colors.secondary }} />
            <Typography variant="h6" sx={{ color: colors.text.primary }}>
              Discovery Logs
            </Typography>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                bgcolor: connected ? colors.secondary : colors.text.disabled,
              }}
            />
            {logs.length > 0 && (
              <B4Badge variant="filled" label={`${logs.length} lines`} />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            {logs.length > 0 && (
              <>
                <Tooltip title="Clear logs">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearLogs();
                    }}
                    sx={{ color: colors.text.secondary }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Fullscreen logs">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalOpen(true);
                    }}
                    sx={{ color: colors.text.secondary }}
                  >
                    <FullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              sx={{ color: colors.text.secondary }}
            >
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Stack>
        </Stack>

        {/* Log content - inline panel */}
        {expanded && logContent(150, scrollRef)}
      </Paper>

      {/* Fullscreen log modal */}
      <B4Dialog
        title="Discovery Logs"
        icon={<LogsIcon />}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        fullWidth
        maxWidth="xl"
        actions={
          <>
            <Button
              onClick={clearLogs}
              startIcon={<ClearIcon />}
              size="small"
            >
              Clear
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              onClick={() => setModalOpen(false)}
              variant="contained"
              startIcon={<CloseIcon />}
            >
              Close
            </Button>
          </>
        }
      >
        {logContent("60vh", modalScrollRef)}
      </B4Dialog>
    </>
  );
};

function getLogColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("success") || line.includes("✓") || lower.includes("best"))
    return colors.secondary;
  if (lower.includes("failed") || line.includes("✗") || lower.includes("fail"))
    return colors.primary;
  if (lower.includes("phase")) return colors.text.secondary;
  return colors.text.primary;
}
