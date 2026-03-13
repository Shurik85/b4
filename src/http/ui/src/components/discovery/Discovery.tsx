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
import { useTranslation, Trans } from "react-i18next";

export const DiscoveryRunner = () => {
  const { t } = useTranslation();

  const familyNames: Record<StrategyFamily, string> = {
    none: t("discovery.familyNames.none"),
    tcp_frag: t("discovery.familyNames.tcp_frag"),
    tls_record: t("discovery.familyNames.tls_record"),
    oob: t("discovery.familyNames.oob"),
    ip_frag: t("discovery.familyNames.ip_frag"),
    fake_sni: t("discovery.familyNames.fake_sni"),
    sack: t("discovery.familyNames.sack"),
    syn_fake: t("discovery.familyNames.syn_fake"),
    desync: t("discovery.familyNames.desync"),
    delay: t("discovery.familyNames.delay"),
    disorder: t("discovery.familyNames.disorder"),
    extsplit: t("discovery.familyNames.extsplit"),
    firstbyte: t("discovery.familyNames.firstbyte"),
    combo: t("discovery.familyNames.combo"),
    hybrid: t("discovery.familyNames.hybrid"),
    window: t("discovery.familyNames.window"),
    mutation: t("discovery.familyNames.mutation"),
    incoming: t("discovery.familyNames.incoming"),
  };

  const phaseNames: Record<DiscoveryPhase, string> = {
    baseline: t("discovery.phaseNames.baseline"),
    cached: t("discovery.phaseNames.cached"),
    strategy_detection: t("discovery.phaseNames.strategy_detection"),
    optimization: t("discovery.phaseNames.optimization"),
    combination: t("discovery.phaseNames.combination"),
    dns_detection: t("discovery.phaseNames.dns_detection"),
  };

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 1970) return t("core.timeAgo.justNow");
    const diff = Date.now() - date.getTime();
    if (diff < 0) return t("core.timeAgo.justNow");
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("core.timeAgo.justNow");
    if (minutes < 60) return t("core.timeAgo.minutesAgo", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("core.timeAgo.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t("core.timeAgo.daysAgo", { count: days });
    return t("core.timeAgo.monthsAgo", { count: Math.floor(days / 30) });
  }

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
    validationTries: Number(localStorage.getItem("b4_discovery_validation_tries")) || 1,
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
      showSuccess(t("discovery.createdSet", { name }));
      setAddDialog({
        open: false,
        domain: "",
        presetName: "",
        setConfig: null,
      });
    } else {
      showError(t("discovery.createSetFailed"));
    }
    setAddingPreset(false);
  };

  const handleAddToExisting = async (setId: string, domain: string) => {
    setAddingPreset(true);
    const res = await addDomainToSet(setId, domain);
    if (res.success) {
      showSuccess(t("discovery.addedDomainToSet"));
      setAddDialog({
        open: false,
        domain: "",
        presetName: "",
        setConfig: null,
      });
    } else {
      showError(t("discovery.addDomainToSetFailed"));
    }
    setAddingPreset(false);
  };

  const handleReset = useCallback(() => {
    resetDiscovery();
    setExpandedDomains(new Set());
  }, [resetDiscovery]);

  const getDomainStatusBadge = (domainResult: { best_success: boolean; dns_result?: { transport_blocked?: boolean } }) => {
    if (domainResult.best_success) {
      return <B4Badge label={t("discovery.badges.success")} size="small" variant="filled" color="primary" />;
    }
    if (running) {
      return <B4Badge label={t("discovery.badges.testing")} size="small" variant="outlined" color="primary" />;
    }
    if (domainResult.dns_result?.transport_blocked) {
      return <B4Badge label={t("discovery.badges.blocked")} size="small" color="info" />;
    }
    return <B4Badge label={t("core.failed")} size="small" color="error" />;
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
        title={t("discovery.title")}
        description={t("discovery.description")}
        icon={<DiscoveryIcon />}
      >
        <B4Alert icon={<DiscoveryIcon />}>
          <Trans i18nKey="discovery.alert" />
        </B4Alert>

        {/* URL input with chips */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <B4TextField
            label={t("discovery.addDomainLabel")}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onPaste={handleUrlPaste}
            inputRef={domainInputRef}
            placeholder={t("discovery.addDomainPlaceholder")}
            disabled={running || !!isReconnecting}
            helperText={t("discovery.addDomainHelper")}
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
                {t("discovery.startDiscovery")}
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
                {t("core.cancel")}
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
                {t("discovery.newDiscovery")}
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
            emptyMessage={t("discovery.noUrlsAdded")}
            showEmpty
          />
        )}
        <DiscoveryOptionsPanel
          options={options}
          onChange={setOptions}
          onClearCache={() => {
            void (async () => {
              const res = await clearCache();
              if (res.success) showSuccess(t("discovery.cacheCleared"));
              else showError(t("discovery.cacheClearFailed"));
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
              {t("discovery.reconnecting")}
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
                    ? t("discovery.checkingDns")
                    : t("discovery.checksProgress", { completed: suite.completed_checks, total: suite.total_checks })}
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
                          label={t("discovery.configs", { success: successCount, total: totalCount })}
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
                          ? t("discovery.tested", { count: totalCount })
                          : t("discovery.noWorkingConfig")}
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
                                  ? t("discovery.currentBest")
                                  : t("discovery.bestConfiguration")}
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
                            {running ? t("discovery.useCurrentBest") : t("discovery.useThisStrategy")}
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
                            {t("discovery.foundWorking", { remaining: suite ? suite.total_checks - totalCount : "..." })}
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
                                            : t("core.failed")
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
                                          <Tooltip title={t("discovery.useThisConfig")}>
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
                            <Trans i18nKey="discovery.transportBlocked" />
                          </B4Alert>
                        ) : (
                          <B4Alert severity="error">
                            {t("discovery.allFailed", { count: Object.keys(domainResult.results).length })}
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
                            ? t("discovery.moreConfigsToTest", { count: suite.total_checks - totalCount })
                            : t("discovery.testingConfigurations")}
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
          title={t("core.history.title")}
          description={`${history.length} ${history.length !== 1 ? t("discovery.history.domainsTested_plural", { count: history.length }) : t("discovery.history.domainsTested", { count: history.length })}`}
          icon={<HistoryIcon />}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: -1 }}>
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => {
                void (async () => {
                  const res = await clearHistory();
                  if (res.success) showSuccess(t("discovery.history.historyCleared"));
                  else showError(t("discovery.history.historyClearFailed"));
                })();
              }}
              sx={{ color: colors.text.secondary, textTransform: "none" }}
            >
              {t("core.history.clearHistory")}
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
                          <B4Badge label={t("discovery.badges.success")} size="small" variant="filled" color="primary" />
                        ) : entry.dns_result?.transport_blocked ? (
                          <B4Badge label={t("discovery.badges.blocked")} size="small" color="info" />
                        ) : (
                          <B4Badge label={t("core.failed")} size="small" color="error" />
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
                            : t("discovery.noWorkingConfig")}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                          {formatTimeAgo(entry.end_time)}
                        </Typography>
                        <Tooltip title={t("core.history.removeFromHistory")}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              void (async () => {
                                const res = await deleteHistoryDomain(entry.domain);
                                if (res.success) showSuccess(t("discovery.history.removedFromHistory", { domain: entry.domain }));
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
                                  {t("discovery.bestConfiguration")}
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
                                {t("discovery.useThisStrategy")}
                              </Button>
                            )}
                          </Box>
                        )}

                        {/* DNS info */}
                        {entry.dns_result?.is_poisoned && (
                          <B4Alert severity="warning" sx={{ mb: 1 }}>
                            {entry.dns_result.best_server
                              ? t("discovery.history.dnsPoisoningServer", { server: entry.dns_result.best_server })
                              : t("discovery.history.dnsPoisoning")}
                          </B4Alert>
                        )}
                        {entry.dns_result?.transport_blocked && (
                          <B4Alert severity="error" sx={{ mb: 1 }}>
                            {t("discovery.history.transportBlockedShort")}
                          </B4Alert>
                        )}

                        {/* Improvement badge */}
                        {entry.improvement && entry.improvement > 0 && (
                          <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 1 }}>
                            {t("discovery.history.baseline", { speed: (entry.baseline_speed! / 1024 / 1024).toFixed(2) })}
                            {" → "}
                            {t("discovery.history.best", { speed: (entry.best_speed / 1024 / 1024).toFixed(2) })}
                            {" "}
                            {t("discovery.history.improvement", { percent: entry.improvement.toFixed(0) })}
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
                                                : t("core.failed")
                                            }`}
                                            size="small"
                                            color={result.status === "complete" ? "primary" : "error"}
                                          />
                                          {result.status === "complete" &&
                                            result.preset_name !== entry.best_preset &&
                                            result.set && (
                                              <Tooltip title={t("discovery.useThisConfig")}>
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
                            {t("discovery.history.retest")}
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
