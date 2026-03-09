import { useState, useRef, useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Stack,
  Typography,
  LinearProgress,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
} from "@mui/material";
import {
  StartIcon,
  StopIcon,
  RefreshIcon,
  AddIcon,
  SpeedIcon,
  ExpandIcon,
  CollapseIcon,
  ImprovementIcon,
  DiscoveryIcon,
  HistoryIcon,
  DeleteIcon,
  ClearIcon,
} from "@b4.icons";
import { colors } from "@design";
import { B4SetConfig } from "@models/config";
import { DiscoveryAddDialog } from "./AddDialog";
import { B4Alert, B4Badge, B4Section, B4TextField, B4ChipList, B4PlusButton } from "@b4.elements";
import { useSnackbar } from "@context/SnackbarProvider";
import { DiscoveryLogPanel } from "./LogPanel";
import { useDiscovery } from "@hooks/useDiscovery";
import {
  StrategyFamily,
  DiscoveryPhase,
  DomainPresetResult,
  HistoryEntry,
} from "@models/discovery";
import { useSets } from "@hooks/useSets";
import { useCaptures } from "@b4.capture";
import { DiscoveryOptionsPanel, DiscoveryOptions } from "./Options";

const familyNames: Record<StrategyFamily, string> = {
  none: "Baseline",
  tcp_frag: "TCP Fragmentation",
  tls_record: "TLS Record Split",
  oob: "Out-of-Band",
  ip_frag: "IP Fragmentation",
  fake_sni: "Fake SNI",
  sack: "SACK Drop",
  syn_fake: "SYN Fake",
  desync: "Desync",
  delay: "Delay",
  disorder: "Disorder",
  extsplit: "Extension Split",
  firstbyte: "First-Byte",
  combo: "Combo",
  hybrid: "Hybrid",
  window: "Window Manipulation",
  mutation: "Mutation",
  incoming: "Incoming",
};

const phaseNames: Record<DiscoveryPhase, string> = {
  baseline: "Baseline Test",
  cached: "Cached Strategies",
  strategy_detection: "Strategy Detection",
  optimization: "Optimization",
  combination: "Combination Test",
  dns_detection: "DNS Detection",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const DiscoveryRunner = () => {
  const {
    startDiscovery,
    cancelDiscovery,
    resetDiscovery,
    addPresetAsSet,
    clearCache,
    clearHistory,
    deleteHistoryDomain,
    discoveryRunning: running,
    suiteId,
    suite,
    error,
    history,
  } = useDiscovery();
  const { showSuccess, showError } = useSnackbar();

  const { addDomainToSet } = useSets();

  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set()
  );
  const [expandedHistoryDomains, setExpandedHistoryDomains] = useState<Set<string>>(
    new Set()
  );

  const { captures, loadCaptures } = useCaptures();
  const [options, setOptions] = useState<DiscoveryOptions>(() => ({
    skipDNS: localStorage.getItem("b4_discovery_skipdns") === "true",
    skipCache: localStorage.getItem("b4_discovery_skipcache") === "true",
    payloadFiles: [],
    validationTries: Number.parseInt(localStorage.getItem("b4_discovery_validation_tries") || "1") || 1,
    tlsVersion: (localStorage.getItem("b4_discovery_tls_version") as DiscoveryOptions["tlsVersion"]) || "auto",
  }));

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  useEffect(() => {
    localStorage.setItem("b4_discovery_skipdns", String(options.skipDNS));
  }, [options.skipDNS]);

  useEffect(() => {
    localStorage.setItem("b4_discovery_skipcache", String(options.skipCache));
  }, [options.skipCache]);

  useEffect(() => {
    localStorage.setItem("b4_discovery_validation_tries", String(options.validationTries));
  }, [options.validationTries]);

  useEffect(() => {
    localStorage.setItem("b4_discovery_tls_version", options.tlsVersion);
  }, [options.tlsVersion]);

  const [checkUrls, setCheckUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");

  const [addingPreset, setAddingPreset] = useState(false);
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    domain: string;
    presetName: string;
    setConfig: B4SetConfig | null;
  }>({ open: false, domain: "", presetName: "", setConfig: null });
  const domainInputRef = useRef<HTMLInputElement | null>(null);

  const progress = suite
    ? Math.min((suite.completed_checks / suite.total_checks) * 100, 100)
    : 0;
  const isReconnecting = suiteId && running && !suite;

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  const handleAddStrategy = (domain: string, result: DomainPresetResult) => {
    let presetName = result.preset_name;
    if (options.tlsVersion === "tls12") presetName += "-tls12";
    else if (options.tlsVersion === "tls13") presetName += "-tls13";

    setAddDialog({
      open: true,
      domain,
      presetName,
      setConfig: result.set || null,
    });
  };
  const toggleDomainExpand = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const extractDomain = (url: string): string => {
    try {
      const withProto = url.includes("://") ? url : `https://${url}`;
      return new URL(withProto).hostname;
    } catch {
      return url.split("/")[0];
    }
  };

  const addUrls = useCallback(
    (raw: string) => {
      const parts = raw
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (parts.length === 0) return;
      setCheckUrls((prev) => {
        const existing = new Set(prev);
        const next = [...prev];
        for (const url of parts) {
          if (!existing.has(url)) {
            existing.add(url);
            next.push(url);
          }
        }
        return next;
      });
      setUrlInput("");
    },
    []
  );

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        if (urlInput.trim()) {
          e.preventDefault();
          addUrls(urlInput);
        }
      }
    },
    [urlInput, addUrls]
  );

  const handleUrlPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text");
      if (text.includes("\n") || text.includes(",")) {
        e.preventDefault();
        addUrls(text);
      }
    },
    [addUrls]
  );

  const removeUrl = useCallback((url: string) => {
    setCheckUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const handleAddNew = async (name: string, domain: string) => {
    if (!addDialog.setConfig) return;
    setAddingPreset(true);
    const configToAdd = {
      ...addDialog.setConfig,
      name,
      targets: { ...addDialog.setConfig.targets, sni_domains: [domain] },
    };
    const res = await addPresetAsSet(configToAdd);
    if (res.success) {
      showSuccess(`Created set "${name}"`);
      setAddDialog({
        open: false,
        domain: "",
        presetName: "",
        setConfig: null,
      });
    } else {
      showError("Failed to create set");
    }
    setAddingPreset(false);
  };

  const handleAddToExisting = async (setId: string, domain: string) => {
    setAddingPreset(true);
    const res = await addDomainToSet(setId, domain);
    if (res.success) {
      showSuccess(`Added domain to set`);
      setAddDialog({
        open: false,
        domain: "",
        presetName: "",
        setConfig: null,
      });
    } else {
      showError("Failed to add domain to set");
    }
    setAddingPreset(false);
  };

  const handleReset = useCallback(() => {
    resetDiscovery();
    setExpandedDomains(new Set());
  }, [resetDiscovery]);

  const getDomainStatusBadge = (domainResult: { best_success: boolean; dns_result?: { transport_blocked?: boolean } }) => {
    if (domainResult.best_success) {
      return <B4Badge label="Success" size="small" variant="filled" color="primary" />;
    }
    if (running) {
      return <B4Badge label="Testing..." size="small" variant="outlined" color="primary" />;
    }
    if (domainResult.dns_result?.transport_blocked) {
      return <B4Badge label="Blocked" size="small" color="info" />;
    }
    return <B4Badge label="Failed" size="small" color="error" />;
  };

  const groupResultsByPhase = (results: Record<string, DomainPresetResult>) => {
    const grouped: Record<DiscoveryPhase, DomainPresetResult[]> = {
      baseline: [],
      cached: [],
      strategy_detection: [],
      optimization: [],
      combination: [],
      dns_detection: [],
    };

    Object.values(results).forEach((result) => {
      const phase = result.phase || "strategy_detection";
      grouped[phase].push(result);
    });

    return grouped;
  };

  return (
    <Stack spacing={3}>
      {/* Control Panel */}
      <B4Section
        title="Configuration Discovery"
        description="Hierarchical testing: Strategy Detection → Optimization → Combination"
        icon={<DiscoveryIcon />}
      >
        <B4Alert icon={<DiscoveryIcon />}>
          <strong>Configuration Discovery:</strong> Automatically test multiple
          configuration presets to find the most effective DPI bypass settings
          for the domains you specify below. B4 will temporarily apply different
          configurations and measure their performance.
        </B4Alert>

        {/* URL input with chips */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <B4TextField
            label="Add domain or URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onPaste={handleUrlPaste}
            inputRef={domainInputRef}
            placeholder="youtube.com, https://discord.com/path"
            disabled={running || !!isReconnecting}
            helperText="Press Enter to add. Paste multiple URLs separated by commas or newlines."
          />
          <B4PlusButton
            onClick={() => addUrls(urlInput)}
            disabled={!urlInput.trim() || running || !!isReconnecting}
          />
          <Box sx={{ flexShrink: 0 }}>
            {!running && !suite && (
              <Button
                startIcon={<StartIcon />}
                variant="contained"
                onClick={() => {
                  void startDiscovery(
                    checkUrls,
                    options.skipDNS,
                    options.skipCache,
                    options.payloadFiles,
                    options.validationTries,
                    options.tlsVersion
                  );
                }}
                disabled={checkUrls.length === 0}
                sx={{
                  whiteSpace: "nowrap",
                }}
              >
                Start Discovery
              </Button>
            )}
            {(running || isReconnecting) && (
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<StopIcon />}
                onClick={() => {
                  void cancelDiscovery();
                }}
                sx={{
                  whiteSpace: "nowrap",
                }}
              >
                Cancel
              </Button>
            )}
            {suite && !running && (
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleReset}
                sx={{
                  whiteSpace: "nowrap",
                }}
              >
                New Discovery
              </Button>
            )}
          </Box>
        </Box>
        {!running && !suite && (
          <B4ChipList
            items={checkUrls}
            getKey={(url) => url}
            getLabel={(url) => extractDomain(url)}
            onDelete={removeUrl}
            emptyMessage="No URLs added yet"
            showEmpty
          />
        )}
        <DiscoveryOptionsPanel
          options={options}
          onChange={setOptions}
          onClearCache={() => {
            void (async () => {
              const res = await clearCache();
              if (res.success) showSuccess("Discovery cache cleared");
              else showError("Failed to clear cache");
            })();
          }}
          captures={captures}
          disabled={running || !!isReconnecting}
        />
        {error && <B4Alert severity="error">{error}</B4Alert>}

        {isReconnecting && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} sx={{ color: colors.secondary }} />
            <Typography variant="body2" sx={{ color: colors.text.secondary }}>
              Reconnecting to running discovery...
            </Typography>
          </Box>
        )}
        {/* Progress indicator */}
        {running && suite && (
          <Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {suite.current_phase && (
                    <B4Badge
                      label={phaseNames[suite.current_phase]}
                      size="small"
                      color="primary"
                      sx={{ mr: 2 }}
                    />
                  )}
                  {suite.current_phase === "dns_detection"
                    ? "Checking DNS..."
                    : `${suite.completed_checks} of ${suite.total_checks} checks`}
                  {suite.current_domain && (
                    <B4Badge
                      label={suite.current_domain}
                      size="small"
                      variant="outlined"
                      color="primary"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Typography>
              </Box>
              {suite.current_phase !== "dns_detection" && (
                <Typography variant="body2" color="text.secondary">
                  {Number.isNaN(progress) ? "0" : progress.toFixed(0)}%
                </Typography>
              )}
            </Box>
            <LinearProgress
              variant={
                suite.current_phase === "dns_detection"
                  ? "indeterminate"
                  : "determinate"
              }
              value={progress}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: colors.background.dark,
                "& .MuiLinearProgress-bar": {
                  bgcolor: colors.secondary,
                  borderRadius: 4,
                },
              }}
            />
          </Box>
        )}
      </B4Section>

      {/* Discovery Log Panel */}
      <DiscoveryLogPanel running={running} />

      {suite?.domain_discovery_results &&
        Object.keys(suite.domain_discovery_results).length > 0 && (
          <Stack spacing={2}>
            {Object.values(suite.domain_discovery_results)
              .sort((a, b) => b.best_speed - a.best_speed)
              .map((domainResult) => {
                const isExpanded = expandedDomains.has(domainResult.domain);
                const groupedResults = groupResultsByPhase(
                  domainResult.results
                );
                const successCount = Object.values(domainResult.results).filter(
                  (r) => r.status === "complete"
                ).length;
                const totalCount = Object.keys(domainResult.results).length;

                return (
                  <Paper
                    key={domainResult.domain}
                    elevation={0}
                    sx={{
                      bgcolor: colors.background.paper,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    {/* Domain Header */}
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: colors.accent.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleDomainExpand(domainResult.domain)}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <IconButton size="small">
                          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                        </IconButton>
                        <Typography
                          variant="h6"
                          sx={{ color: colors.text.primary }}
                        >
                          {domainResult.domain}
                        </Typography>
                        {getDomainStatusBadge(domainResult)}
                        <B4Badge
                          label={`${successCount}/${totalCount} configs`}
                          size="small"
                          variant="filled"
                          color="primary"
                        />
                        {domainResult.improvement &&
                          domainResult.improvement > 0 && (
                            <B4Badge
                              icon={<ImprovementIcon />}
                              label={`+${domainResult.improvement.toFixed(0)}%`}
                              size="small"
                              color="primary"
                            />
                          )}
                      </Box>
                      <Typography
                        variant="h6"
                        sx={{
                          color: domainResult.best_success
                            ? colors.secondary
                            : colors.text.secondary,
                          fontWeight: 600,
                        }}
                      >
                        {domainResult.best_success
                          ? `${(domainResult.best_speed / 1024 / 1024).toFixed(
                              2
                            )} MB/s`
                          : running
                          ? `${totalCount} tested...`
                          : "No working config"}
                      </Typography>
                    </Box>

                    {/* Best Configuration Quick View (always visible) */}
                    {(domainResult.best_success ||
                      (running &&
                        Object.values(domainResult.results).some(
                          (r) => r.status === "complete"
                        ))) && (
                      <Box>
                        <Box
                          sx={{
                            p: 2,
                            bgcolor: colors.background.default,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottom: running
                              ? "none"
                              : `1px solid ${colors.border.default}`,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <SpeedIcon sx={{ color: colors.secondary }} />
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: colors.text.secondary }}
                              >
                                {running
                                  ? "Current Best"
                                  : "Best Configuration"}
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{
                                  color: colors.text.primary,
                                  fontWeight: 600,
                                }}
                              >
                                {domainResult.best_preset}
                                {domainResult.best_preset &&
                                  domainResult.results[domainResult.best_preset]
                                    ?.family && (
                                    <B4Badge
                                      label={
                                        familyNames[
                                          domainResult.results[
                                            domainResult.best_preset
                                          ].family!
                                        ]
                                      }
                                      color="primary"
                                    />
                                  )}
                              </Typography>
                            </Box>
                          </Box>
                          <Button
                            variant="contained"
                            startIcon={
                              addingPreset ? (
                                <CircularProgress size={18} color="inherit" />
                              ) : (
                                <AddIcon />
                              )
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              const bestResult =
                                domainResult.results[domainResult.best_preset];
                              void handleAddStrategy(
                                domainResult.domain,
                                bestResult
                              );
                            }}
                            disabled={addingPreset}
                            sx={{
                              bgcolor: colors.secondary,
                              color: colors.background.default,
                              "&:hover": { bgcolor: colors.primary },
                            }}
                          >
                            {running ? "Use Current Best" : "Use This Strategy"}
                          </Button>
                        </Box>
                        {/* Info message while still running */}
                        {running && domainResult.best_success && (
                          <B4Alert
                            severity="info"
                            sx={{
                              borderRadius: 0,
                              bgcolor: colors.accent.secondary,
                              "& .MuiAlert-icon": { color: colors.secondary },
                              borderBottom: `1px solid ${colors.border.default}`,
                            }}
                          >
                            Found a working configuration! Still testing{" "}
                            {suite ? suite.total_checks - totalCount : "..."}{" "}
                            more configs — a faster option may be found.
                          </B4Alert>
                        )}
                      </Box>
                    )}

                    {/* Expanded Details */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ p: 3 }}>
                        <Divider
                          sx={{ my: 2, borderColor: colors.border.default }}
                        />

                        {/* Results by Phase */}
                        {(
                          [
                            "cached",
                            "baseline",
                            "strategy_detection",
                            "optimization",
                            "combination",
                          ] as DiscoveryPhase[]
                        )
                          .filter((phase) => groupedResults[phase].length > 0)
                          .map((phase) => (
                            <Box key={phase} sx={{ mb: 3 }}>
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  color: colors.text.secondary,
                                  mb: 1.5,
                                  textTransform: "uppercase",
                                  fontSize: "0.7rem",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                {phaseNames[phase]}
                                <B4Badge
                                  label={groupedResults[phase].length}
                                  size="small"
                                  color="primary"
                                />
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={1}
                                flexWrap="wrap"
                                gap={1}
                              >
                                {groupedResults[phase]
                                  .sort((a, b) => b.speed - a.speed)
                                  .map((result) => (
                                    <Box
                                      key={result.preset_name}
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                      }}
                                    >
                                      <B4Badge
                                        label={`${result.preset_name}: ${
                                          result.status === "complete"
                                            ? `${(
                                                result.speed /
                                                1024 /
                                                1024
                                              ).toFixed(2)} MB/s`
                                            : "Failed"
                                        }`}
                                        size="small"
                                        color={
                                          result.status === "complete"
                                            ? "primary"
                                            : "error"
                                        }
                                      />
                                      {result.status === "complete" &&
                                        result.preset_name !==
                                          domainResult.best_preset && (
                                          <Tooltip title="Use this configuration">
                                            <IconButton
                                              size="small"
                                              onClick={() => {
                                                void handleAddStrategy(
                                                  domainResult.domain,
                                                  result
                                                );
                                              }}
                                              disabled={addingPreset}
                                              sx={{
                                                p: 0.5,
                                                bgcolor: colors.background.dark,
                                                border: `1px solid ${colors.border.light}`,
                                                "&:hover": {
                                                  bgcolor:
                                                    colors.accent.secondary,
                                                  borderColor: colors.secondary,
                                                },
                                              }}
                                            >
                                              <AddIcon fontSize="small" />
                                            </IconButton>
                                          </Tooltip>
                                        )}
                                    </Box>
                                  ))}
                              </Stack>
                            </Box>
                          ))}
                      </Box>
                    </Collapse>

                    {/* Failed state */}
                    {!domainResult.best_success && !running && (
                      <Box sx={{ p: 3 }}>
                        {domainResult.dns_result?.transport_blocked ? (
                          <B4Alert severity="warning">
                            <strong>Transport blocked:</strong> This domain is
                            blocked at the IP/network level — TCP connections
                            cannot be established to any known IP address. DPI
                            bypass strategies cannot help with IP-level blocking.
                            A VPN or proxy is required for this domain.
                          </B4Alert>
                        ) : (
                          <B4Alert severity="error">
                            All {Object.keys(domainResult.results).length} tested
                            configurations failed for this domain. Check your
                            network connection and domain accessibility.
                          </B4Alert>
                        )}
                      </Box>
                    )}
                    {!domainResult.best_success && running && (
                      <Box sx={{ p: 2, bgcolor: colors.background.default }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color: colors.text.secondary,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <CircularProgress
                            size={14}
                            sx={{ color: colors.text.secondary }}
                          />
                          {suite && suite.total_checks > totalCount
                            ? `${
                                suite.total_checks - totalCount
                              } more configurations to test...`
                            : "Testing configurations..."}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                );
              })}
          </Stack>
        )}

      {/* Discovery History */}
      {history.length > 0 && (
        <B4Section
          title="Previous Results"
          description={`${history.length} domain${history.length !== 1 ? "s" : ""} tested`}
          icon={<HistoryIcon />}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: -1 }}>
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => {
                void (async () => {
                  const res = await clearHistory();
                  if (res.success) showSuccess("History cleared");
                  else showError("Failed to clear history");
                })();
              }}
              sx={{ color: colors.text.secondary, textTransform: "none" }}
            >
              Clear History
            </Button>
          </Box>
          <Stack spacing={1}>
            {[...history]
              .sort((a: HistoryEntry, b: HistoryEntry) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())
              .map((entry: HistoryEntry) => {
                const isExpanded = expandedHistoryDomains.has(entry.domain);
                const toggleExpand = () => {
                  setExpandedHistoryDomains((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry.domain)) next.delete(entry.domain);
                    else next.add(entry.domain);
                    return next;
                  });
                };
                const groupedResults = entry.results
                  ? groupResultsByPhase(entry.results)
                  : null;

                return (
                  <Paper
                    key={entry.domain}
                    elevation={0}
                    sx={{
                      bgcolor: colors.background.paper,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    {/* History Domain Header */}
                    <Box
                      sx={{
                        px: 2,
                        py: 1.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        "&:hover": { bgcolor: colors.accent.primary },
                      }}
                      onClick={toggleExpand}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <IconButton size="small" sx={{ p: 0 }}>
                          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                        </IconButton>
                        <Typography
                          variant="body1"
                          sx={{ color: colors.text.primary, fontWeight: 600 }}
                        >
                          {entry.domain}
                        </Typography>
                        {entry.best_success ? (
                          <B4Badge label="Success" size="small" variant="filled" color="primary" />
                        ) : entry.dns_result?.transport_blocked ? (
                          <B4Badge label="Blocked" size="small" color="info" />
                        ) : (
                          <B4Badge label="Failed" size="small" color="error" />
                        )}
                        {entry.best_family && entry.best_success && (
                          <B4Badge
                            label={familyNames[entry.best_family] ?? entry.best_family}
                            size="small"
                            color="primary"
                          />
                        )}
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color: entry.best_success ? colors.secondary : colors.text.secondary,
                            fontWeight: 600,
                          }}
                        >
                          {entry.best_success
                            ? `${(entry.best_speed / 1024 / 1024).toFixed(2)} MB/s`
                            : "No working config"}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                          {formatTimeAgo(entry.end_time)}
                        </Typography>
                        <Tooltip title="Remove from history">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              void (async () => {
                                const res = await deleteHistoryDomain(entry.domain);
                                if (res.success) showSuccess(`Removed ${entry.domain} from history`);
                              })();
                            }}
                            sx={{
                              p: 0.5,
                              color: colors.text.secondary,
                              "&:hover": { color: colors.text.primary },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    {/* Expanded History Details */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ px: 2, pb: 2, pt: 1 }}>
                        {/* Best config summary */}
                        {entry.best_success && entry.best_preset && (
                          <Box
                            sx={{
                              p: 1.5,
                              mb: 2,
                              bgcolor: colors.background.default,
                              borderRadius: 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                              <SpeedIcon sx={{ color: colors.secondary }} />
                              <Box>
                                <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                                  Best Configuration
                                </Typography>
                                <Typography variant="body2" sx={{ color: colors.text.primary, fontWeight: 600 }}>
                                  {entry.best_preset}
                                </Typography>
                              </Box>
                            </Box>
                            {entry.results?.[entry.best_preset]?.set && (
                              <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const bestResult = entry.results![entry.best_preset];
                                  void handleAddStrategy(entry.domain, bestResult);
                                }}
                                disabled={addingPreset}
                                sx={{
                                  bgcolor: colors.secondary,
                                  color: colors.background.default,
                                  "&:hover": { bgcolor: colors.primary },
                                }}
                              >
                                Use This Strategy
                              </Button>
                            )}
                          </Box>
                        )}

                        {/* DNS info */}
                        {entry.dns_result?.is_poisoned && (
                          <B4Alert severity="warning" sx={{ mb: 1 }}>
                            DNS poisoning detected
                            {entry.dns_result.best_server && ` — best server: ${entry.dns_result.best_server}`}
                          </B4Alert>
                        )}
                        {entry.dns_result?.transport_blocked && (
                          <B4Alert severity="error" sx={{ mb: 1 }}>
                            Transport blocked — IP-level blocking detected. A VPN or proxy is required.
                          </B4Alert>
                        )}

                        {/* Improvement badge */}
                        {entry.improvement && entry.improvement > 0 && (
                          <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 1 }}>
                            Baseline: {(entry.baseline_speed! / 1024 / 1024).toFixed(2)} MB/s
                            {" → "}
                            Best: {(entry.best_speed / 1024 / 1024).toFixed(2)} MB/s
                            {" "}
                            (+{entry.improvement.toFixed(0)}% improvement)
                          </Typography>
                        )}

                        {/* Results by phase */}
                        {groupedResults && (
                          <>
                            <Divider sx={{ my: 1.5, borderColor: colors.border.default }} />
                            {(
                              [
                                "cached",
                                "baseline",
                                "strategy_detection",
                                "optimization",
                                "combination",
                              ] as DiscoveryPhase[]
                            )
                              .filter((phase) => groupedResults[phase].length > 0)
                              .map((phase) => (
                                <Box key={phase} sx={{ mb: 2 }}>
                                  <Typography
                                    variant="subtitle2"
                                    sx={{
                                      color: colors.text.secondary,
                                      mb: 1,
                                      textTransform: "uppercase",
                                      fontSize: "0.7rem",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 1,
                                    }}
                                  >
                                    {phaseNames[phase]}
                                    <B4Badge
                                      label={groupedResults[phase].length}
                                      size="small"
                                      color="primary"
                                    />
                                  </Typography>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                                    {groupedResults[phase]
                                      .sort((a, b) => b.speed - a.speed)
                                      .map((result) => (
                                        <Box
                                          key={result.preset_name}
                                          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                                        >
                                          <B4Badge
                                            label={`${result.preset_name}: ${
                                              result.status === "complete"
                                                ? `${(result.speed / 1024 / 1024).toFixed(2)} MB/s`
                                                : "Failed"
                                            }`}
                                            size="small"
                                            color={result.status === "complete" ? "primary" : "error"}
                                          />
                                          {result.status === "complete" &&
                                            result.preset_name !== entry.best_preset &&
                                            result.set && (
                                              <Tooltip title="Use this configuration">
                                                <IconButton
                                                  size="small"
                                                  onClick={() => {
                                                    void handleAddStrategy(entry.domain, result);
                                                  }}
                                                  disabled={addingPreset}
                                                  sx={{
                                                    p: 0.5,
                                                    bgcolor: colors.background.dark,
                                                    border: `1px solid ${colors.border.light}`,
                                                    "&:hover": {
                                                      bgcolor: colors.accent.secondary,
                                                      borderColor: colors.secondary,
                                                    },
                                                  }}
                                                >
                                                  <AddIcon fontSize="small" />
                                                </IconButton>
                                              </Tooltip>
                                            )}
                                        </Box>
                                      ))}
                                  </Stack>
                                </Box>
                              ))}
                          </>
                        )}

                        {/* Re-test button */}
                        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            disabled={running}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCheckUrls([entry.url]);
                              resetDiscovery();
                            }}
                            sx={{ textTransform: "none" }}
                          >
                            Re-test
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Paper>
                );
              })}
          </Stack>
        </B4Section>
      )}

      <DiscoveryAddDialog
        open={addDialog.open}
        domain={addDialog.domain}
        presetName={addDialog.presetName}
        setConfig={addDialog.setConfig}
        onClose={() =>
          setAddDialog({
            open: false,
            domain: "",
            presetName: "",
            setConfig: null,
          })
        }
        onAddNew={(name: string, domain: string) => {
          void handleAddNew(name, domain);
        }}
        onAddToExisting={(setId: string, domain: string) => {
          void handleAddToExisting(setId, domain);
        }}
        loading={addingPreset}
      />
    </Stack>
  );
};
