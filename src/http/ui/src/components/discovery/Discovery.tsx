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
import {
  B4Alert,
  B4Badge,
  B4Section,
  B4TextField,
  B4ChipList,
  B4PlusButton,
} from "@b4.elements";
import { useSnackbar } from "@context/SnackbarProvider";
import { DiscoveryLogPanel } from "./LogPanel";
import { useDiscovery } from "@hooks/useDiscovery";
import {
  StrategyFamily,
  DiscoveryPhase,
  DiscoveryResult,
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

  function formatTimeAgo(dateStr: string, fallback?: string): string {
    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 1970) {
      if (fallback) {
        date = new Date(fallback);
      }
      if (Number.isNaN(date.getTime()) || date.getFullYear() < 1970) {
        return "";
      }
    }
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
    new Set(),
  );
  const [expandedHistoryDomains, setExpandedHistoryDomains] = useState<
    Set<string>
  >(new Set());

  const { captures, loadCaptures } = useCaptures();
  const [options, setOptions] = useState<DiscoveryOptions>(() => ({
    skipDNS: localStorage.getItem("b4_discovery_skipdns") === "true",
    skipCache: localStorage.getItem("b4_discovery_skipcache") === "true",
    payloadFiles: [],
    validationTries:
      Number(localStorage.getItem("b4_discovery_validation_tries")) || 1,
    tlsVersion:
      (localStorage.getItem(
        "b4_discovery_tls_version",
      ) as DiscoveryOptions["tlsVersion"]) || "auto",
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
    localStorage.setItem(
      "b4_discovery_validation_tries",
      String(options.validationTries),
    );
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
    domains: string[];
    presetName: string;
    setConfig: B4SetConfig | null;
  }>({ open: false, domain: "", domains: [], presetName: "", setConfig: null });
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
      domains: [domain],
      presetName,
      setConfig: result.set || null,
    });
  };

  const handleAddGroupStrategy = (group: StrategyGroup) => {
    let presetName = familyNames[group.family];
    if (options.tlsVersion === "tls12") presetName += "-tls12";
    else if (options.tlsVersion === "tls13") presetName += "-tls13";

    setAddDialog({
      open: true,
      domain: group.domains[0].domain,
      domains: group.domains.map((d) => d.domain),
      presetName,
      setConfig: group.representativeSet,
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

  const addUrls = useCallback((raw: string) => {
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
  }, []);

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        if (urlInput.trim()) {
          e.preventDefault();
          addUrls(urlInput);
        }
      }
    },
    [urlInput, addUrls],
  );

  const handleUrlPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text");
      if (text.includes("\n") || text.includes(",")) {
        e.preventDefault();
        addUrls(text);
      }
    },
    [addUrls],
  );

  const removeUrl = useCallback((url: string) => {
    setCheckUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const handleAddNew = async (
    name: string,
    domain: string,
    allDomains?: string[],
  ) => {
    if (!addDialog.setConfig) return;
    setAddingPreset(true);
    const sniDomains =
      allDomains && allDomains.length > 1 ? allDomains : [domain];
    const configToAdd = {
      ...addDialog.setConfig,
      name,
      targets: { ...addDialog.setConfig.targets, sni_domains: sniDomains },
    };
    const res = await addPresetAsSet(configToAdd);
    if (res.success) {
      showSuccess(t("discovery.createdSet", { name }));
      setAddDialog({
        open: false,
        domain: "",
        domains: [],
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
        domains: [],
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

  const getDomainStatusBadge = (domainResult: {
    best_success: boolean;
    dns_result?: { transport_blocked?: boolean };
  }) => {
    if (domainResult.best_success) {
      return (
        <B4Badge
          label={t("discovery.badges.success")}
          size="small"
          variant="filled"
          color="primary"
        />
      );
    }
    if (running) {
      return (
        <B4Badge
          label={t("discovery.badges.testing")}
          size="small"
          variant="outlined"
          color="primary"
        />
      );
    }
    if (domainResult.dns_result?.transport_blocked) {
      return (
        <B4Badge
          label={t("discovery.badges.blocked")}
          size="small"
          color="info"
        />
      );
    }
    return <B4Badge label={t("core.failed")} size="small" color="error" />;
  };

  interface StrategyGroup {
    family: StrategyFamily;
    domains: {
      domain: string;
      speed: number;
      improvement?: number;
      presetName: string;
    }[];
    minSpeed: number;
    maxSpeed: number;
    representativeSet: B4SetConfig | null;
  }

  const groupByStrategy = (
    results: Record<string, DiscoveryResult>,
  ): { success: StrategyGroup[]; failed: DiscoveryResult[] } => {
    const groups: Record<string, StrategyGroup> = {};
    const failed: DiscoveryResult[] = [];

    Object.values(results).forEach((dr) => {
      if (!dr.best_success || !dr.best_preset) {
        failed.push(dr);
        return;
      }
      const bestResult = dr.results[dr.best_preset];
      if (!bestResult) {
        failed.push(dr);
        return;
      }
      const family = bestResult.family || "none";
      if (!groups[family]) {
        groups[family] = {
          family,
          domains: [],
          minSpeed: dr.best_speed,
          maxSpeed: dr.best_speed,
          representativeSet: bestResult.set || null,
        };
      }
      groups[family].domains.push({
        domain: dr.domain,
        speed: dr.best_speed,
        improvement: dr.improvement,
        presetName: dr.best_preset,
      });
      if (dr.best_speed > groups[family].maxSpeed) {
        groups[family].maxSpeed = dr.best_speed;
        groups[family].representativeSet =
          bestResult.set || groups[family].representativeSet;
      }
      groups[family].minSpeed = Math.min(
        groups[family].minSpeed,
        dr.best_speed,
      );
    });

    const success = Object.values(groups).sort(
      (a, b) => b.maxSpeed - a.maxSpeed,
    );
    return { success, failed };
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
                    options.tlsVersion,
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
                    : t("discovery.checksProgress", {
                        completed: suite.completed_checks,
                        total: suite.total_checks,
                      })}
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
            {/* Discovery Log Panel */}
            <Box sx={{ mt: 3 }}>
              <DiscoveryLogPanel running={running} />
            </Box>
          </Box>
        )}
      </B4Section>

      {/* Live per-domain view while running */}
      {running &&
        suite?.domain_discovery_results &&
        Object.keys(suite.domain_discovery_results).length > 0 && (
          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
            gap: 2,
          }}>
            {Object.values(suite.domain_discovery_results)
              .sort((a, b) => b.best_speed - a.best_speed)
              .map((domainResult) => {
                const totalCount = Object.keys(domainResult.results).length;
                const isExpanded = expandedDomains.has(domainResult.domain);
                const successResults = Object.values(domainResult.results)
                  .filter((r) => r.status === "complete")
                  .sort((a, b) => b.speed - a.speed);
                const failedCount = Object.values(domainResult.results)
                  .filter((r) => r.status === "failed").length;

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
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <IconButton size="small">
                          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                        </IconButton>
                        <Typography variant="h6" sx={{ color: colors.text.primary }}>
                          {domainResult.domain}
                        </Typography>
                        {getDomainStatusBadge(domainResult)}
                        <B4Badge
                          label={`${successResults.length}/${totalCount}`}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                      </Box>
                      {!domainResult.best_success && (
                        <Typography variant="h6" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                          {t("discovery.tested", { count: totalCount })}
                        </Typography>
                      )}
                    </Box>
                    {domainResult.best_success && (
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: colors.background.default,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <SpeedIcon sx={{ color: colors.secondary }} />
                          <Box>
                            <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                              {t("discovery.currentBest")}
                            </Typography>
                            <Typography variant="body1" sx={{ color: colors.text.primary, fontWeight: 600 }}>
                              {domainResult.best_preset}
                              {domainResult.results[domainResult.best_preset]?.family && (
                                <B4Badge
                                  label={familyNames[domainResult.results[domainResult.best_preset].family!]}
                                  color="primary"
                                />
                              )}
                            </Typography>
                          </Box>
                        </Box>
                        <Button
                          variant="contained"
                          startIcon={addingPreset ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleAddStrategy(domainResult.domain, domainResult.results[domainResult.best_preset]);
                          }}
                          disabled={addingPreset}
                          sx={{ bgcolor: colors.secondary, color: colors.background.default, "&:hover": { bgcolor: colors.primary } }}
                        >
                          {t("discovery.useCurrentBest")}
                        </Button>
                      </Box>
                    )}
                    {!domainResult.best_success && (
                      <Box sx={{ p: 2, bgcolor: colors.background.default }}>
                        <Typography
                          variant="body2"
                          sx={{ color: colors.text.secondary, display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <CircularProgress size={14} sx={{ color: colors.text.secondary }} />
                          {suite && suite.total_checks > totalCount
                            ? t("discovery.moreConfigsToTest", { count: suite.total_checks - totalCount })
                            : t("discovery.testingConfigurations")}
                        </Typography>
                      </Box>
                    )}

                    <Collapse in={isExpanded}>
                      <Divider sx={{ borderColor: colors.border.default }} />
                      <Box sx={{ p: 2 }}>
                        {successResults.length > 0 && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} sx={{ mb: failedCount > 0 ? 1 : 0 }}>
                            {successResults.map((result, idx) => (
                              <Box key={result.preset_name} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <B4Badge
                                  label={`#${idx + 1} ${result.preset_name}`}
                                  size="small"
                                  color={result.preset_name === domainResult.best_preset ? "primary" : "default"}
                                />
                                {result.preset_name !== domainResult.best_preset && result.set && (
                                  <Tooltip title={t("discovery.useThisConfig")}>
                                    <IconButton
                                      size="small"
                                      onClick={() => { void handleAddStrategy(domainResult.domain, result); }}
                                      disabled={addingPreset}
                                      sx={{
                                        p: 0.5,
                                        bgcolor: colors.background.dark,
                                        border: `1px solid ${colors.border.light}`,
                                        "&:hover": { bgcolor: colors.accent.secondary, borderColor: colors.secondary },
                                      }}
                                    >
                                      <AddIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            ))}
                          </Stack>
                        )}
                        {failedCount > 0 && (
                          <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                            {t("discovery.failedCount", { count: failedCount })}
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </Paper>
                );
              })}
          </Box>
        )}

      {/* Grouped strategy view when complete */}
      {!running &&
        suite?.domain_discovery_results &&
        Object.keys(suite.domain_discovery_results).length > 0 &&
        (() => {
          const { success: strategyGroups, failed: failedDomains } =
            groupByStrategy(suite.domain_discovery_results);
          return (
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
              gap: 2,
            }}>
              {strategyGroups.map((group) => {
                const isExpanded = expandedDomains.has(group.family);

                return (
                  <Paper
                    key={group.family}
                    elevation={0}
                    sx={{
                      bgcolor: colors.background.paper,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: colors.accent.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleDomainExpand(group.family)}
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
                          {familyNames[group.family]}
                        </Typography>
                        <B4Badge
                          label={t("discovery.badges.success")}
                          size="small"
                          variant="filled"
                          color="primary"
                        />
                        <B4Badge
                          label={t("discovery.grouped.domainCount", {
                            count: group.domains.length,
                          })}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                      </Box>
                    </Box>

                    <Box sx={{ p: 2, bgcolor: colors.background.default }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        gap={1}
                        sx={{ mb: 2 }}
                      >
                        {group.domains.map((d) => (
                          <B4Badge
                            key={d.domain}
                            label={d.domain}
                            size="small"
                            color="primary"
                          />
                        ))}
                      </Stack>
                      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          variant="contained"
                          startIcon={
                            addingPreset ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <AddIcon />
                            )
                          }
                          onClick={() => {
                            void handleAddGroupStrategy(group);
                          }}
                          disabled={addingPreset}
                          sx={{
                            bgcolor: colors.secondary,
                            color: colors.background.default,
                            "&:hover": { bgcolor: colors.primary },
                          }}
                        >
                          {group.domains.length > 1
                            ? t("discovery.grouped.applyAll", {
                                count: group.domains.length,
                              })
                            : t("discovery.useThisStrategy")}
                        </Button>
                      </Box>
                    </Box>

                    <Collapse in={isExpanded}>
                      <Divider sx={{ borderColor: colors.border.default }} />
                      <Box sx={{ p: 2 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            color: colors.text.secondary,
                            mb: 1.5,
                            textTransform: "uppercase",
                            fontSize: "0.7rem",
                          }}
                        >
                          {t("discovery.grouped.perDomainDetails")}
                        </Typography>
                        <Stack spacing={1}>
                          {group.domains
                            .sort((a, b) => b.speed - a.speed)
                            .map((d) => {
                              const dr =
                                suite.domain_discovery_results![d.domain];
                              const successResults = Object.values(dr.results)
                                .filter((r) => r.status === "complete")
                                .sort((a, b) => b.speed - a.speed)
                                .slice(0, 5);
                              return (
                                <Box
                                  key={d.domain}
                                  sx={{
                                    p: 1.5,
                                    bgcolor: colors.background.dark,
                                    borderRadius: 1,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      mb: successResults.length > 1 ? 1 : 0,
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontWeight: 600,
                                          color: colors.text.primary,
                                        }}
                                      >
                                        {d.domain}
                                      </Typography>
                                      <B4Badge
                                        label={d.presetName}
                                        size="small"
                                        color="primary"
                                      />
                                    </Box>
                                    {d.improvement && d.improvement > 0 && (
                                      <B4Badge
                                        icon={<ImprovementIcon />}
                                        label={`+${d.improvement.toFixed(0)}%`}
                                        size="small"
                                        color="primary"
                                      />
                                    )}
                                  </Box>
                                  {successResults.length > 1 && (
                                    <Stack
                                      direction="row"
                                      spacing={0.5}
                                      flexWrap="wrap"
                                      gap={0.5}
                                    >
                                      {successResults
                                        .filter(
                                          (r) =>
                                            r.preset_name !== dr.best_preset,
                                        )
                                        .map((result, idx) => (
                                          <B4Badge
                                            key={result.preset_name}
                                            label={`#${idx + 2} ${result.preset_name}`}
                                            size="small"
                                            color="default"
                                          />
                                        ))}
                                    </Stack>
                                  )}
                                </Box>
                              );
                            })}
                        </Stack>
                      </Box>
                    </Collapse>
                  </Paper>
                );
              })}

              {failedDomains.map((dr) => (
                <Paper
                  key={dr.domain}
                  elevation={0}
                  sx={{
                    bgcolor: colors.background.paper,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: colors.accent.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Typography
                        variant="h6"
                        sx={{ color: colors.text.primary }}
                      >
                        {dr.domain}
                      </Typography>
                      {dr.dns_result?.transport_blocked ? (
                        <B4Badge
                          label={t("discovery.badges.blocked")}
                          size="small"
                          color="info"
                        />
                      ) : (
                        <B4Badge
                          label={t("core.failed")}
                          size="small"
                          color="error"
                        />
                      )}
                    </Box>
                    <Typography
                      variant="h6"
                      sx={{ color: colors.text.secondary, fontWeight: 600 }}
                    >
                      {t("discovery.noWorkingConfig")}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    {dr.dns_result?.transport_blocked ? (
                      <B4Alert severity="warning">
                        <Trans i18nKey="discovery.transportBlocked" />
                      </B4Alert>
                    ) : (
                      <B4Alert severity="error">
                        {t("discovery.allFailed", {
                          count: Object.keys(dr.results).length,
                        })}
                      </B4Alert>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>
          );
        })()}

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
                  if (res.success)
                    showSuccess(t("discovery.history.historyCleared"));
                  else showError(t("discovery.history.historyClearFailed"));
                })();
              }}
              sx={{ color: colors.text.secondary, textTransform: "none" }}
            >
              {t("core.history.clearHistory")}
            </Button>
          </Box>
          {(() => {
            const sorted = [...history].sort(
              (a: HistoryEntry, b: HistoryEntry) =>
                new Date(b.end_time).getTime() - new Date(a.end_time).getTime(),
            );
            const familyGroups: Record<string, HistoryEntry[]> = {};
            const failedEntries: HistoryEntry[] = [];
            sorted.forEach((entry) => {
              if (!entry.best_success) {
                failedEntries.push(entry);
                return;
              }
              const family = entry.best_family || "none";
              if (!familyGroups[family]) familyGroups[family] = [];
              familyGroups[family].push(entry);
            });
            const groupEntries = Object.entries(familyGroups).sort(
              ([, a], [, b]) =>
                Math.max(...b.map((e) => e.best_speed)) -
                Math.max(...a.map((e) => e.best_speed)),
            );

            return (
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
                gap: 2,
              }}>
                {groupEntries.map(([family, entries]) => {
                  const familyKey = family as StrategyFamily;
                  const isExpanded = expandedHistoryDomains.has(family);
                  const fastestEntry = entries.reduce((a, b) =>
                    a.best_speed > b.best_speed ? a : b,
                  );
                  const representativeSet =
                    fastestEntry.results?.[fastestEntry.best_preset]?.set ||
                    null;

                  return (
                    <Paper
                      key={family}
                      elevation={0}
                      sx={{
                        bgcolor: colors.background.paper,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: colors.accent.primary,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setExpandedHistoryDomains((prev) => {
                            const next = new Set(prev);
                            if (next.has(family)) next.delete(family);
                            else next.add(family);
                            return next;
                          });
                        }}
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
                            {familyNames[familyKey] ?? family}
                          </Typography>
                          <B4Badge
                            label={t("discovery.badges.success")}
                            size="small"
                            variant="filled"
                            color="primary"
                          />
                          <B4Badge
                            label={t("discovery.grouped.domainCount", {
                              count: entries.length,
                            })}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                          <Typography
                            variant="caption"
                            sx={{ color: colors.text.secondary }}
                          >
                            {formatTimeAgo(entries[0].end_time, entries[0].start_time)}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ p: 2, bgcolor: colors.background.default }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          gap={1}
                          sx={{ mb: 2 }}
                        >
                          {entries.map((entry) => (
                            <B4Badge
                              key={entry.domain}
                              label={entry.domain}
                              size="small"
                              color="primary"
                            />
                          ))}
                        </Stack>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            disabled={running}
                            onClick={() => {
                              setCheckUrls(entries.map((e) => e.url));
                              resetDiscovery();
                            }}
                            sx={{ textTransform: "none" }}
                          >
                            {t("discovery.history.retest")}
                          </Button>
                          {representativeSet && (
                            <Button
                              variant="contained"
                              startIcon={
                                addingPreset ? (
                                  <CircularProgress size={18} color="inherit" />
                                ) : (
                                  <AddIcon />
                                )
                              }
                              onClick={() => {
                                const allDomains = entries.map((e) => e.domain);
                                setAddDialog({
                                  open: true,
                                  domain: allDomains[0],
                                  domains: allDomains,
                                  presetName: familyNames[familyKey] ?? family,
                                  setConfig: representativeSet,
                                });
                              }}
                              disabled={addingPreset}
                              sx={{
                                bgcolor: colors.secondary,
                                color: colors.background.default,
                                "&:hover": { bgcolor: colors.primary },
                              }}
                            >
                              {entries.length > 1
                                ? t("discovery.grouped.applyAll", {
                                    count: entries.length,
                                  })
                                : t("discovery.useThisStrategy")}
                            </Button>
                          )}
                        </Box>
                      </Box>

                      <Collapse in={isExpanded}>
                        <Divider sx={{ borderColor: colors.border.default }} />
                        <Box sx={{ p: 2 }}>
                          <Stack spacing={1}>
                            {entries
                              .sort((a, b) => b.best_speed - a.best_speed)
                              .map((entry) => (
                                <Box
                                  key={entry.domain}
                                  sx={{
                                    p: 1.5,
                                    bgcolor: colors.background.dark,
                                    borderRadius: 1,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontWeight: 600,
                                          color: colors.text.primary,
                                        }}
                                      >
                                        {entry.domain}
                                      </Typography>
                                      <B4Badge
                                        label={entry.best_preset}
                                        size="small"
                                        color="primary"
                                      />
                                    </Box>
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                      }}
                                    >
                                      {entry.improvement &&
                                        entry.improvement > 0 && (
                                          <B4Badge
                                            icon={<ImprovementIcon />}
                                            label={`+${entry.improvement.toFixed(0)}%`}
                                            size="small"
                                            color="primary"
                                          />
                                        )}
                                      <Tooltip
                                        title={t(
                                          "core.history.removeFromHistory",
                                        )}
                                      >
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void (async () => {
                                              const res =
                                                await deleteHistoryDomain(
                                                  entry.domain,
                                                );
                                              if (res.success)
                                                showSuccess(
                                                  t(
                                                    "discovery.history.removedFromHistory",
                                                    { domain: entry.domain },
                                                  ),
                                                );
                                            })();
                                          }}
                                          sx={{
                                            p: 0.5,
                                            color: colors.text.secondary,
                                            "&:hover": {
                                              color: colors.text.primary,
                                            },
                                          }}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>
                                  </Box>
                                </Box>
                              ))}
                          </Stack>
                        </Box>
                      </Collapse>
                    </Paper>
                  );
                })}

                {failedEntries.map((entry) => (
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
                    <Box
                      sx={{
                        px: 2,
                        py: 1.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                      >
                        <Typography
                          variant="body1"
                          sx={{ color: colors.text.primary, fontWeight: 600 }}
                        >
                          {entry.domain}
                        </Typography>
                        {entry.dns_result?.transport_blocked ? (
                          <B4Badge
                            label={t("discovery.badges.blocked")}
                            size="small"
                            color="info"
                          />
                        ) : (
                          <B4Badge
                            label={t("core.failed")}
                            size="small"
                            color="error"
                          />
                        )}
                      </Box>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: colors.text.secondary }}
                        >
                          {formatTimeAgo(entry.end_time, entry.start_time)}
                        </Typography>
                        <Tooltip title={t("core.history.removeFromHistory")}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              void (async () => {
                                const res = await deleteHistoryDomain(
                                  entry.domain,
                                );
                                if (res.success)
                                  showSuccess(
                                    t("discovery.history.removedFromHistory", {
                                      domain: entry.domain,
                                    }),
                                  );
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
                    <Box sx={{ px: 2, pb: 2 }}>
                      {entry.dns_result?.transport_blocked ? (
                        <B4Alert severity="warning">
                          <Trans i18nKey="discovery.transportBlocked" />
                        </B4Alert>
                      ) : (
                        <B4Alert severity="error">
                          {t("discovery.allFailed", {
                            count: Object.keys(entry.results || {}).length,
                          })}
                        </B4Alert>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            );
          })()}
        </B4Section>
      )}

      <DiscoveryAddDialog
        open={addDialog.open}
        domain={addDialog.domain}
        domains={addDialog.domains}
        presetName={addDialog.presetName}
        setConfig={addDialog.setConfig}
        onClose={() =>
          setAddDialog({
            open: false,
            domain: "",
            domains: [],
            presetName: "",
            setConfig: null,
          })
        }
        onAddNew={(name: string, domain: string, allDomains?: string[]) => {
          void handleAddNew(name, domain, allDomains);
        }}
        onAddToExisting={(setId: string, domain: string) => {
          void handleAddToExisting(setId, domain);
        }}
        loading={addingPreset}
      />
    </Stack>
  );
};
