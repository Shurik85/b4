import { useState, useEffect, useMemo } from "react";
import { Button, Stack, Typography } from "@mui/material";
import { ImportExportIcon, CopyIcon, DownloadIcon, CheckCircleIcon } from "@b4.icons";
import { B4Alert, B4Section, B4TextField } from "@b4.elements";
import { useSnackbar } from "@context/SnackbarProvider";
import { useTranslation, Trans } from "react-i18next";

import { B4SetConfig } from "@models/config";
import { createDefaultSet, defaultRoutingConfig } from "@models/defaults";

type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stripObjectDefaults(obj: Obj, defaults: Obj): unknown {
  const result: Obj = {};
  for (const key of Object.keys(obj)) {
    if (!(key in defaults)) {
      result[key] = obj[key];
      continue;
    }
    const stripped = stripDefaults(obj[key], defaults[key]);
    if (stripped !== undefined) {
      result[key] = stripped;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Recursively remove fields that match their default values */
function stripDefaults(obj: unknown, defaults: unknown): unknown {
  if (Array.isArray(obj)) {
    return JSON.stringify(obj) === JSON.stringify(defaults) ? undefined : obj;
  }
  if (isPlainObject(obj) && isPlainObject(defaults)) {
    return stripObjectDefaults(obj, defaults);
  }
  return obj === defaults ? undefined : obj;
}

function mergeObjectWithDefaults(partial: Obj, defaults: Obj): Obj {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(partial)) {
    result[key] = key in result ? mergeWithDefaults(value, result[key]) : value;
  }
  return result;
}

/** Deep merge partial config with defaults to reconstruct full config */
function mergeWithDefaults(partial: unknown, defaults: unknown): unknown {
  if (partial === undefined || partial === null) return defaults;
  if (Array.isArray(defaults)) {
    return Array.isArray(partial) ? partial : defaults;
  }
  if (isPlainObject(defaults)) {
    return isPlainObject(partial)
      ? mergeObjectWithDefaults(partial, defaults)
      : defaults;
  }
  return partial;
}

/** Build export JSON: version + name/enabled/targets always included, rest only if non-default */
function buildExportJson(config: B4SetConfig): Record<string, unknown> {
  const defaults = createDefaultSet(0);
  const alwaysInclude = new Set(["name", "enabled"]);
  const skip = new Set(["id", "stats"]);
  const configObj = config as unknown as Record<string, unknown>;
  const defaultsObj = defaults as unknown as Record<string, unknown>;

  const result: Record<string, unknown> = {
    b4_version: import.meta.env.VITE_APP_VERSION || "dev",
  };

  for (const key of Object.keys(configObj)) {
    if (skip.has(key)) continue;
    if (alwaysInclude.has(key)) {
      result[key] = configObj[key];
      continue;
    }
    const stripped = stripDefaults(configObj[key], defaultsObj[key]);
    if (stripped !== undefined) {
      result[key] = stripped;
    }
  }

  if (isPlainObject(result.targets)) {
    delete result.targets.source_devices;
  }

  return result;
}

interface ImportExportSettingsProps {
  config: B4SetConfig;
  onImport: (importedConfig: B4SetConfig) => void;
}

export const ImportExportSettings = ({
  config,
  onImport,
}: ImportExportSettingsProps) => {
  const { t } = useTranslation();
  const [jsonValue, setJsonValue] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const { showSuccess, showError } = useSnackbar();
  const hasSourceDevices = useMemo(
    () => (config.targets.source_devices ?? []).length > 0,
    [config.targets.source_devices],
  );

  useEffect(() => {
    setJsonValue(JSON.stringify(buildExportJson(config)));
  }, [config]);

  function migrateSetConfig(set: Record<string, unknown>): B4SetConfig {
    const tcp = set.tcp as Record<string, unknown> | undefined;

    if (tcp) {
      if ("win_mode" in tcp && !tcp.win) {
        tcp.win = {
          mode: tcp.win_mode || "off",
          values: tcp.win_values || [0, 1460, 8192, 65535],
        };
        delete tcp.win_mode;
        delete tcp.win_values;
      }

      if ("desync_mode" in tcp && !tcp.desync) {
        tcp.desync = {
          mode: tcp.desync_mode || "off",
          ttl: tcp.desync_ttl || 3,
          count: tcp.desync_count || 3,
          post_desync: tcp.post_desync || false,
        };
        delete tcp.desync_mode;
        delete tcp.desync_ttl;
        delete tcp.desync_count;
        delete tcp.post_desync;
      }

      if (!tcp.incoming) {
        tcp.incoming = {
          mode: "off",
          min: 14,
          max: 14,
          fake_ttl: 3,
          fake_count: 3,
          strategy: "badsum",
        };
      }
    }

    const frag = set.fragmentation as Record<string, unknown> | undefined;
    if (frag) {
      if (!frag.seq_overlap_pattern) {
        frag.seq_overlap_pattern = [];
      }
      delete frag.overlap;
    }

    const faking = set.faking as Record<string, unknown> | undefined;
    if (faking) {
      if (!faking.tls_mod) {
        faking.tls_mod = [];
      }
      if (!faking.payload_file) {
        faking.payload_file = "";
      }
    }

    set.routing = { ...defaultRoutingConfig, ...(set.routing as Record<string, unknown>) };

    return set as unknown as B4SetConfig;
  }

  const importJson = (text: string) => {
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      const { b4_version: _, ...configFields } = raw;

      const defaults = createDefaultSet(0);
      const fullConfig = mergeWithDefaults(
        configFields,
        defaults as unknown as Record<string, unknown>,
      ) as Record<string, unknown>;

      const parsed = migrateSetConfig(fullConfig);

      if (
        !parsed.name ||
        !parsed.tcp ||
        !parsed.udp ||
        !parsed.fragmentation ||
        !parsed.faking ||
        !parsed.targets
      ) {
        showError(t("sets.importExport.invalidFields"));
        return false;
      }

      parsed.id = config.id;
      onImport(parsed);
      setImportSuccess(true);
      return true;
    } catch {
      showError(t("sets.importExport.invalidJson"));
      return false;
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData("text");
    if (importJson(pastedText)) {
      e.preventDefault();
    }
  };

  const handleImport = () => {
    importJson(jsonValue);
  };

  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonValue).then(
        () => showSuccess(t("sets.importExport.copiedToClipboard")),
        () => fallbackCopy(jsonValue),
      );
    } else {
      fallbackCopy(jsonValue);
    }
  };

  const fallbackCopy = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      showSuccess(t("sets.importExport.copiedToClipboard"));
    } catch {
      showError(t("sets.importExport.copyFailed"));
    }
    document.body.removeChild(textarea);
  };

  return (
    <B4Section
      title={t("sets.importExport.sectionTitle")}
      icon={<ImportExportIcon />}
    >
      {importSuccess ? (
        <B4Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
          <Trans i18nKey="sets.importExport.importSuccess" />
        </B4Alert>
      ) : (
        <B4Alert severity="info" sx={{ mb: 2 }}>
          {t("sets.importExport.infoAlert")}
        </B4Alert>
      )}
      <Stack spacing={2}>
        <B4TextField
          label={t("sets.importExport.jsonLabel")}
          value={jsonValue}
          onFocus={(e) =>
            (e.target as HTMLTextAreaElement).select()
          }
          onChange={(e) => {
            setJsonValue(e.target.value);
            setImportSuccess(false);
          }}
          onPaste={handlePaste}
          multiline
          rows={10}
          helperText={t("sets.importExport.jsonHelper")}
        />
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<CopyIcon />}
            onClick={handleCopy}
          >
            {t("sets.importExport.copyJson")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleImport}
          >
            {t("sets.importExport.import")}
          </Button>
          {hasSourceDevices && (
            <Typography variant="caption" color="warning.main">
              {t("sets.importExport.deviceFilterWarning")}
            </Typography>
          )}
        </Stack>
      </Stack>
    </B4Section>
  );
};
