import { useState, useEffect } from "react";
import {
  Grid,
  Stack,
  Typography,
  Button,
  Box,
  Paper,
  CircularProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  CaptureIcon,
  CopyIcon,
  ClearIcon,
  DownloadIcon,
  RefreshIcon,
  SuccessIcon,
  UploadIcon,
} from "@b4.icons";
import { useSnackbar } from "@context/SnackbarProvider";
import { B4Dialog, B4TextField, B4Section, B4Alert } from "@b4.elements";
import { useCaptures, Capture } from "@b4.capture";
import { colors, radius } from "@design";

export const CaptureSettings = () => {
  const { showError, showSuccess } = useSnackbar();
  const [probeForm, setProbeForm] = useState({ domain: "" });
  const [uploadForm, setUploadForm] = useState<{
    domain: string;
    file: File | null;
  }>({ domain: "", file: null });

  const {
    captures,
    loading,
    loadCaptures,
    generate, // NEW: instant generation
    deleteCapture,
    clearAll,
    upload,
    download,
  } = useCaptures();

  useEffect(() => {
    loadCaptures().catch(() => {});
  }, [loadCaptures]);

  useEffect(() => {
    if (!uploadForm.domain && uploadForm.file) {
      setUploadForm((prev) => ({ ...prev, domain: prev.file?.name ?? "" }));
    }
  }, [uploadForm]);

  const generateCapture = async () => {
    if (!probeForm.domain) return;

    const capturedDomain = probeForm.domain.toLowerCase().trim();

    try {
      const result = await generate(capturedDomain, "tls");

      if (result.already_captured) {
        showSuccess(`Already have payload for ${capturedDomain}`);
      } else {
        showSuccess(
          `Generated optimized payload for ${capturedDomain} (SNI-first for DPI bypass)`,
        );
        setProbeForm({ domain: "" });
      }
    } catch (error) {
      console.error("Failed to generate:", error);
      showError("Failed to generate payload");
    }
  };

  const handleDelete = async (capture: Capture) => {
    try {
      await deleteCapture(capture.protocol, capture.domain);
      showSuccess(`Deleted ${capture.domain}`);
    } catch {
      showError("Failed to delete capture");
    }
  };

  const handleClear = async () => {
    if (!confirm("Delete all captured payloads?")) return;
    try {
      await clearAll();
      showSuccess("All captures cleared");
    } catch {
      showError("Failed to clear captures");
    }
  };

  const [hexDialog, setHexDialog] = useState<{
    open: boolean;
    capture: Capture | null;
  }>({ open: false, capture: null });

  const uploadCapture = async () => {
    if (!uploadForm.file || !uploadForm.domain) return;

    try {
      await upload(uploadForm.file, uploadForm.domain.toLowerCase(), "tls");
      showSuccess(`Uploaded payload for ${uploadForm.domain}`);
      setUploadForm({ domain: "", file: null });
    } catch {
      showError("Failed to upload file");
    }
  };

  const copyHex = (hexData: string) => {
    void navigator.clipboard.writeText(hexData);
    showSuccess("Hex data copied to clipboard");
  };

  return (
    <Stack spacing={3}>
      {/* Info */}
      <B4Alert icon={<CaptureIcon />}>
        <Typography variant="subtitle2" gutterBottom>
          Generate optimized TLS ClientHello with SNI-first extension order
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Instant generation for DPI bypass. One payload per domain. Use in
          Faking → Captured Payload
        </Typography>
      </B4Alert>

      {/* Upload + Capture side by side */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Section
            title="Upload Custom Payload"
            description="Upload your own binary payload file (max 64KB)"
            icon={<UploadIcon />}
          >
            <Stack spacing={2}>
              <B4TextField
                label="Name/Domain"
                value={uploadForm.domain}
                onChange={(e: { target: { value: string } }) =>
                  setUploadForm({
                    ...uploadForm,
                    domain: e.target.value.toLowerCase(),
                  })
                }
                placeholder="youtube.com"
                helperText="Name associated with the uploaded payload"
                disabled={loading}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  component="label"
                  color="secondary"
                  variant="outlined"
                  disabled={loading}
                  sx={{ flexShrink: 0 }}
                >
                  {uploadForm.file ? uploadForm.file.name : "Choose File..."}
                  <input
                    type="file"
                    hidden
                    accept=".bin,application/octet-stream"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadForm({ ...uploadForm, file });
                    }}
                  />
                </Button>
                {uploadForm.file && (
                  <Typography variant="caption" color="text.secondary">
                    {uploadForm.file.size} bytes
                  </Typography>
                )}
                <Button
                  variant="contained"
                  startIcon={
                    loading ? <CircularProgress size={16} /> : <UploadIcon />
                  }
                  onClick={() => {
                    uploadCapture().catch(() => {});
                  }}
                  disabled={loading || !uploadForm.file || !uploadForm.domain}
                >
                  {loading ? "Uploading..." : "Upload"}
                </Button>
              </Stack>
            </Stack>
          </B4Section>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4Section
            title="Generate Payload"
            description="Instantly generate optimized TLS ClientHello"
            icon={<CaptureIcon />}
          >
            <Stack spacing={2}>
              <B4TextField
                label="Domain"
                value={probeForm.domain}
                onChange={(e: { target: { value: string } }) =>
                  setProbeForm({ domain: e.target.value.toLowerCase() })
                }
                onKeyPress={(e: { key: string }) => {
                  if (e.key === "Enter" && !loading && probeForm.domain) {
                    void generateCapture();
                  }
                }}
                placeholder="max.ru"
                helperText="Enter domain to generate payload for"
                disabled={loading}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={
                    loading ? <CircularProgress size={16} /> : <CaptureIcon />
                  }
                  onClick={() => void generateCapture()}
                  disabled={loading || !probeForm.domain}
                >
                  {loading ? "Generating..." : "Generate"}
                </Button>
                <Tooltip title="Refresh list">
                  <IconButton
                    onClick={() => {
                      loadCaptures().catch(() => {});
                    }}
                    disabled={loading}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                {captures.length > 0 && (
                  <Tooltip title="Clear all captures">
                    <IconButton
                      onClick={() => void handleClear()}
                      color="error"
                      disabled={loading}
                    >
                      <ClearIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </B4Section>
        </Grid>
      </Grid>

      {/* Generated Payloads - Flat grid like SetCards */}
      {captures.length > 0 && (
        <B4Section
          title="Generated Payloads"
          description={`${captures.length} optimized payload${
            captures.length === 1 ? "" : "s"
          } ready for use (SNI-first for DPI bypass)`}
          icon={<DownloadIcon />}
        >
          <Grid container spacing={3}>
            {captures.map((capture) => (
              <Grid
                key={`${capture.protocol}:${capture.domain}`}
                size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}
              >
                <CaptureCard
                  capture={capture}
                  onViewHex={() => setHexDialog({ open: true, capture })}
                  onDownload={() => download(capture)}
                  onDelete={() => void handleDelete(capture)}
                />
              </Grid>
            ))}
          </Grid>
        </B4Section>
      )}

      {/* Empty State */}
      {captures.length === 0 && !loading && (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: "center",
            border: `1px dashed ${colors.border.default}`,
            borderRadius: radius.md,
          }}
        >
          <CaptureIcon
            sx={{ fontSize: 48, color: colors.text.secondary, mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            No generated payloads yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter a domain above and click Generate to create an optimized
            payload
          </Typography>
        </Paper>
      )}

      {/* Hex Dialog */}
      <B4Dialog
        title="Payload Hex Data"
        subtitle="Copy for use in Faking → Custom Payload"
        icon={<CaptureIcon />}
        open={hexDialog.open}
        onClose={() => setHexDialog({ open: false, capture: null })}
        maxWidth="md"
        fullWidth
        actions={
          <Button
            variant="contained"
            onClick={() => {
              if (hexDialog.capture?.hex_data) {
                copyHex(hexDialog.capture.hex_data);
              }
              setHexDialog({ open: false, capture: null });
            }}
          >
            Copy & Close
          </Button>
        }
      >
        {hexDialog.capture && (
          <Stack spacing={2}>
            <B4Alert icon={<SuccessIcon />}>
              TLS payload for {hexDialog.capture.domain} •{" "}
              {hexDialog.capture.size} bytes
            </B4Alert>
            <Box
              sx={{
                p: 2,
                bgcolor: colors.background.dark,
                borderRadius: radius.sm,
                fontFamily: "monospace",
                fontSize: "0.8rem",
                wordBreak: "break-all",
                maxHeight: 400,
                overflow: "auto",
                userSelect: "all",
              }}
            >
              {hexDialog.capture.hex_data}
            </Box>
          </Stack>
        )}
      </B4Dialog>
    </Stack>
  );
};

// Card component styled like SetCard
interface CaptureCardProps {
  capture: Capture;
  onViewHex: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

const CaptureCard = ({
  capture,
  onViewHex,
  onDownload,
  onDelete,
}: CaptureCardProps) => {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.md,
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: colors.secondary,
          transform: "translateY(-2px)",
          boxShadow: `0 4px 12px ${colors.accent.primary}40`,
        },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        mb={1}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {capture.domain}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {capture.size.toLocaleString()} bytes
          </Typography>
        </Box>
        <CaptureIcon sx={{ color: colors.secondary, fontSize: 20, ml: 1 }} />
      </Stack>

      {/* Timestamp */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
        {new Date(capture.timestamp).toLocaleString()}
      </Typography>

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Actions */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          pt: 2,
          borderTop: `1px solid ${colors.border.light}`,
        }}
      >
        <Tooltip title="View/Copy hex">
          <IconButton size="small" onClick={onViewHex}>
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Download .bin">
          <IconButton size="small" onClick={onDownload}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Delete">
          <IconButton size="small" onClick={onDelete}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
};
