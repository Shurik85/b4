import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    generate,
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
      setUploadForm((prev) => {
        const name = (prev.file?.name ?? "").replace(/\.bin$/i, "");
        return { ...prev, domain: name };
      });
    }
  }, [uploadForm.domain, uploadForm.file]);

  const generateCapture = async () => {
    if (!probeForm.domain) return;

    const capturedDomain = probeForm.domain.toLowerCase().trim();

    try {
      const result = await generate(capturedDomain, "tls");

      if (result.already_captured) {
        showSuccess(
          t("settings.Capture.alreadyCaptured", { domain: capturedDomain }),
        );
      } else {
        showSuccess(
          t("settings.Capture.generateSuccess", { domain: capturedDomain }),
        );
        setProbeForm({ domain: "" });
      }
    } catch (error) {
      console.error("Failed to generate:", error);
      showError(t("settings.Capture.generateFailed"));
    }
  };

  const handleDelete = async (capture: Capture) => {
    try {
      await deleteCapture(capture.protocol, capture.domain);
      showSuccess(
        t("settings.Capture.deleteSuccess", { domain: capture.domain }),
      );
    } catch {
      showError(t("settings.Capture.deleteFailed"));
    }
  };

  const handleClear = async () => {
    if (!confirm(t("settings.Capture.clearConfirm"))) return;
    try {
      await clearAll();
      showSuccess(t("settings.Capture.allCleared"));
    } catch {
      showError(t("settings.Capture.clearFailed"));
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
      showSuccess(
        t("settings.Capture.uploadedSuccess", { domain: uploadForm.domain }),
      );
      setUploadForm({ domain: "", file: null });
    } catch {
      showError(t("settings.Capture.uploadFailed"));
    }
  };

  const copyHex = (hexData: string) => {
    void navigator.clipboard.writeText(hexData);
    showSuccess(t("settings.Capture.hexCopied"));
  };

  return (
    <Stack spacing={3}>
      {/* Info */}
      <B4Alert icon={<CaptureIcon />}>
        <Typography variant="subtitle2" gutterBottom>
          {t("settings.Capture.alert")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("settings.Capture.alertSub")}
        </Typography>
      </B4Alert>

      {/* Upload + Capture side by side */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Section
            title={t("settings.Capture.uploadTitle")}
            description={t("settings.Capture.uploadDescription")}
            icon={<UploadIcon />}
          >
            <Stack spacing={2}>
              <B4TextField
                label={t("settings.Capture.nameDomain")}
                value={uploadForm.domain}
                onChange={(e: { target: { value: string } }) =>
                  setUploadForm({
                    ...uploadForm,
                    domain: e.target.value.toLowerCase(),
                  })
                }
                placeholder="youtube.com"
                helperText={t("settings.Capture.nameDomainHelp")}
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
                  {uploadForm.file
                    ? uploadForm.file.name
                    : t("settings.Capture.chooseFile")}
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
                  {loading ? t("core.uploading") : t("core.upload")}
                </Button>
              </Stack>
            </Stack>
          </B4Section>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <B4Section
            title={t("settings.Capture.generateTitle")}
            description={t("settings.Capture.generateDescription")}
            icon={<CaptureIcon />}
          >
            <Stack spacing={2}>
              <B4TextField
                label={t("settings.Capture.domain")}
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
                helperText={t("settings.Capture.domainHelp")}
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
                  {loading
                    ? t("settings.Capture.generating")
                    : t("core.generate")}
                </Button>
                <Tooltip title={t("settings.Capture.refreshList")}>
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
                  <Tooltip title={t("settings.Capture.clearAll")}>
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
          title={t("settings.Capture.generatedTitle")}
          description={t("settings.Capture.generatedDesc", {
            count: captures.length,
          })}
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
                  onDownload={() => void download(capture)}
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
            {t("settings.Capture.emptyTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("settings.Capture.emptyDesc")}
          </Typography>
        </Paper>
      )}

      {/* Hex Dialog */}
      <B4Dialog
        title={t("settings.Capture.hexTitle")}
        subtitle={t("settings.Capture.hexSubtitle")}
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
            {t("settings.Capture.copyClose")}
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
  const { t } = useTranslation();

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
        <Tooltip title={t("settings.Capture.viewHex")}>
          <IconButton size="small" onClick={onViewHex}>
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("settings.Capture.downloadBin")}>
          <IconButton size="small" onClick={onDownload}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("core.delete")}>
          <IconButton size="small" onClick={onDelete}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
};
