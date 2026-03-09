import { useState, useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import { motion, AnimatePresence } from "motion/react";
import {
  StartIcon,
  StopIcon,
  RefreshIcon,
  SecurityIcon,
  DnsIcon,
  DomainIcon,
  NetworkIcon,
  SniIcon,
  WarningIcon,
  HistoryIcon,
  DeleteIcon,
  ClearIcon,
  ExpandIcon,
  CollapseIcon,
} from "@b4.icons";
import { colors, spacing } from "@design";
import { B4Alert, B4Section, B4Badge } from "@b4.elements";
import { B4Card } from "@common/B4Card";
import { useDetector } from "@hooks/useDetector";
import type { DetectorTestType, DetectorHistoryEntry } from "@models/detector";

import { TestSelectionGrid } from "./TestSelectionGrid";
import { ProgressGauge } from "./ProgressGauge";
import { SummaryDashboard } from "./SummaryDashboard";
import { ResultSection } from "./ResultSection";
import { DNSResults } from "./results/DNSResults";
import { DomainsResults } from "./results/DomainsResults";
import { TCPResults } from "./results/TCPResults";
import { SNIResults } from "./results/SNIResults";
import { testNames, statusColors } from "./constants";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatusLabel(status: string): string {
  if (status === "complete") return "Complete";
  if (status === "canceled") return "Canceled";
  return "Failed";
}

function getHistoryStatusColor(entry: DetectorHistoryEntry): string {
  if (entry.status === "canceled") return statusColors.warning;
  if (entry.status === "failed") return statusColors.error;

  const hasIssues =
    (entry.dns_result &&
      (entry.dns_result.spoof_count > 0 ||
        entry.dns_result.intercept_count > 0)) ||
    (entry.domains_result && entry.domains_result.blocked_count > 0) ||
    (entry.tcp_result && entry.tcp_result.detected_count > 0);

  return hasIssues ? statusColors.error : statusColors.ok;
}

function getHistorySummary(entry: DetectorHistoryEntry): string {
  const parts: string[] = [];

  if (entry.dns_result) {
    const bad =
      entry.dns_result.spoof_count + entry.dns_result.intercept_count;
    parts.push(bad > 0 ? `DNS: ${bad} issues` : "DNS: OK");
  }
  if (entry.domains_result) {
    parts.push(
      entry.domains_result.blocked_count > 0
        ? `Domains: ${entry.domains_result.blocked_count} blocked`
        : "Domains: OK",
    );
  }
  if (entry.tcp_result) {
    parts.push(
      entry.tcp_result.detected_count > 0
        ? `TSPU: ${entry.tcp_result.detected_count} detected`
        : "TSPU: Clean",
    );
  }
  if (entry.sni_result) {
    parts.push(
      entry.sni_result.found_count > 0
        ? `SNI: ${entry.sni_result.found_count} found`
        : "SNI: None",
    );
  }

  return parts.join(" / ");
}

export const DetectorRunner = () => {
  const {
    running,
    suiteId,
    suite,
    error,
    history,
    startDetector,
    cancelDetector,
    resetDetector,
    clearHistory,
    deleteHistoryEntry,
  } = useDetector();

  const defaultTests: Record<DetectorTestType, boolean> = {
    dns: true,
    domains: true,
    tcp: true,
    sni: false,
  };

  const [selectedTests, setSelectedTests] = useState<
    Record<DetectorTestType, boolean>
  >(() => {
    try {
      const saved = localStorage.getItem("detector_selectedTests");
      if (saved) return { ...defaultTests, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return defaultTests;
  });

  useEffect(() => {
    localStorage.setItem("detector_selectedTests", JSON.stringify(selectedTests));
  }, [selectedTests]);

  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(
    null,
  );

  const isReconnecting = suiteId && running && !suite;

  const progress = suite
    ? Math.min(
        (suite.completed_checks / Math.max(suite.total_checks, 1)) * 100,
        100,
      )
    : 0;

  const handleStart = useCallback(() => {
    const tests = (
      Object.entries(selectedTests) as [DetectorTestType, boolean][]
    )
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (tests.length > 0) {
      void startDetector(tests);
    }
  }, [selectedTests, startDetector]);

  const anyTestSelected = Object.values(selectedTests).some(Boolean);
  const hasAnyResult =
    suite &&
    (suite.dns_result ||
      suite.domains_result ||
      suite.tcp_result ||
      suite.sni_result);

  return (
    <Stack spacing={3}>
      <B4Section
        title="TSPU / DPI Detector"
        description="Detect ISP-level Deep Packet Inspection and blocking"
        icon={<SecurityIcon />}
      >
        <B4Alert icon={<SecurityIcon />}>
          <strong>DPI Detector:</strong> Runs diagnostic tests to detect TSPU
          (Technical System for Countering Threats) and ISP-level internet
          blocking. Tests DNS integrity, domain accessibility via TLS/HTTP, and
          TCP connection drops at characteristic byte thresholds. Inspired by{" "}
          <a
            href="https://github.com/Runnin4ik/dpi-detector"
            target="_blank"
            rel="noopener noreferrer"
          >
            Runnin4ik/dpi-detector
          </a>{" "}
          project.
        </B4Alert>

        {/* Test selection */}
        <AnimatePresence mode="wait">
          {!running && !suite && (
            <motion.div
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <TestSelectionGrid
                selectedTests={selectedTests}
                onToggle={(test, checked) =>
                  setSelectedTests((prev) => ({ ...prev, [test]: checked }))
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 1 }}>
          {!running && !suite && (
            <Button
              startIcon={<StartIcon />}
              variant="contained"
              onClick={handleStart}
              disabled={!anyTestSelected}
            >
              Start Detection
            </Button>
          )}
          {(running || isReconnecting) && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<StopIcon />}
              onClick={() => void cancelDetector()}
            >
              Cancel
            </Button>
          )}
          {suite && !running && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={resetDetector}
            >
              New Detection
            </Button>
          )}
        </Box>

        {error && <B4Alert severity="error">{error}</B4Alert>}

        {isReconnecting && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} sx={{ color: colors.secondary }} />
            <Typography variant="body2" sx={{ color: colors.text.secondary }}>
              Reconnecting to running detection...
            </Typography>
          </Box>
        )}

        {/* Progress gauge */}
        <AnimatePresence>
          {running && suite && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressGauge
                progress={progress}
                currentTest={suite.current_test}
                completedChecks={suite.completed_checks}
                totalChecks={suite.total_checks}
                tests={suite.tests}
                suite={suite}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </B4Section>

      {/* Summary Dashboard */}
      <AnimatePresence>
        {hasAnyResult && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <SummaryDashboard suite={suite} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* DNS Results */}
      {suite?.dns_result && (
        <ResultSection
          title="DNS Integrity Check"
          icon={<DnsIcon />}
          summary={suite.dns_result.summary}
          ok={suite.dns_result.status === "OK"}
        >
          {suite.dns_result.doh_blocked && (
            <B4Alert severity="error">
              All DNS-over-HTTPS servers are blocked. Your ISP is filtering
              encrypted DNS.
            </B4Alert>
          )}
          {suite.dns_result.udp_blocked && (
            <B4Alert severity="error">
              All UDP DNS servers (port 53) are blocked.
            </B4Alert>
          )}
          {suite.dns_result.stub_ips &&
            suite.dns_result.stub_ips.length > 0 && (
              <B4Alert severity="warning" icon={<WarningIcon />}>
                Stub/sinkhole IPs detected:{" "}
                {suite.dns_result.stub_ips.join(", ")}. Multiple blocked domains
                resolve to these IPs.
              </B4Alert>
            )}
          {suite.dns_result.domains && suite.dns_result.domains.length > 0 && (
            <DNSResults domains={suite.dns_result.domains} />
          )}
        </ResultSection>
      )}

      {/* Domain Results */}
      {suite?.domains_result && (
        <ResultSection
          title="Domain Accessibility"
          icon={<DomainIcon />}
          summary={suite.domains_result.summary}
          ok={suite.domains_result.blocked_count === 0}
        >
          {suite.domains_result.domains &&
            suite.domains_result.domains.length > 0 && (
              <DomainsResults domains={suite.domains_result.domains} />
            )}
        </ResultSection>
      )}

      {/* TCP Results */}
      {suite?.tcp_result && (
        <ResultSection
          title="TCP Fat Probe Test"
          icon={<NetworkIcon />}
          summary={suite.tcp_result.summary}
          ok={suite.tcp_result.detected_count === 0}
        >
          {suite.tcp_result.targets && suite.tcp_result.targets.length > 0 && (
            <TCPResults targets={suite.tcp_result.targets} />
          )}
        </ResultSection>
      )}

      {/* SNI Results */}
      {suite?.sni_result && (
        <ResultSection
          title="SNI Whitelist Brute-Force"
          icon={<SniIcon />}
          summary={suite.sni_result.summary}
          ok={
            suite.sni_result.tested_count === 0 ||
            suite.sni_result.found_count > 0
          }
        >
          {suite.sni_result.asn_results &&
            suite.sni_result.asn_results.length > 0 && (
              <SNIResults results={suite.sni_result.asn_results} />
            )}
        </ResultSection>
      )}

      {/* Detection History */}
      {history.length > 0 && (
        <B4Section
          title="Previous Results"
          description={`${history.length} detection${history.length === 1 ? "" : "s"} saved`}
          icon={<HistoryIcon />}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => void clearHistory()}
              sx={{ color: colors.text.secondary }}
            >
              Clear History
            </Button>
          </Box>
          <Stack spacing={1}>
            {history.map((entry) => {
              const isExpanded = expandedHistoryId === entry.id;
              const color = getHistoryStatusColor(entry);
              const summaryText = getHistorySummary(entry);

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <B4Card
                    variant="outlined"
                    sx={{
                      borderLeft: `3px solid ${color}`,
                      overflow: "hidden",
                    }}
                  >
                    {/* Header */}
                    <Box
                      sx={{
                        p: spacing.md,
                        cursor: "pointer",
                        "&:hover": { bgcolor: `${colors.text.primary}08` },
                      }}
                      onClick={() =>
                        setExpandedHistoryId(isExpanded ? null : entry.id)
                      }
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1.5}
                          sx={{ flex: 1, minWidth: 0 }}
                        >
                          {isExpanded ? (
                            <CollapseIcon
                              sx={{
                                fontSize: 20,
                                color: colors.text.secondary,
                              }}
                            />
                          ) : (
                            <ExpandIcon
                              sx={{
                                fontSize: 20,
                                color: colors.text.secondary,
                              }}
                            />
                          )}
                          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1}
                            >
                              <B4Badge
                                label={getStatusLabel(entry.status)}
                                sx={{
                                  bgcolor: `${color}22`,
                                  color,
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                }}
                                size="small"
                              />
                              {entry.tests.map((t) => (
                                <B4Badge
                                  key={t}
                                  label={testNames[t]}
                                  size="small"
                                  sx={{
                                    bgcolor: `${colors.text.primary}11`,
                                    color: colors.text.secondary,
                                    fontSize: "0.65rem",
                                  }}
                                />
                              ))}
                            </Stack>
                            <Typography
                              variant="caption"
                              sx={{
                                color: colors.text.secondary,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {summaryText}
                            </Typography>
                          </Stack>
                        </Stack>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: colors.text.secondary }}
                          >
                            {formatTimeAgo(entry.end_time)}
                          </Typography>
                          <Tooltip title="Remove from history">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteHistoryEntry(entry.id);
                              }}
                              sx={{ color: colors.text.secondary }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </Box>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ overflow: "hidden" }}
                        >
                          <Stack
                            spacing={2}
                            sx={{
                              px: spacing.md,
                              pb: spacing.md,
                              borderTop: `1px solid ${colors.text.primary}11`,
                              pt: spacing.md,
                            }}
                          >
                            {/* DNS */}
                            {entry.dns_result && (
                              <ResultSection
                                title="DNS Integrity Check"
                                icon={<DnsIcon />}
                                summary={entry.dns_result.summary}
                                ok={entry.dns_result.status === "OK"}
                              >
                                {entry.dns_result.domains &&
                                  entry.dns_result.domains.length > 0 && (
                                    <DNSResults
                                      domains={entry.dns_result.domains}
                                    />
                                  )}
                              </ResultSection>
                            )}

                            {/* Domains */}
                            {entry.domains_result && (
                              <ResultSection
                                title="Domain Accessibility"
                                icon={<DomainIcon />}
                                summary={entry.domains_result.summary}
                                ok={
                                  entry.domains_result.blocked_count === 0
                                }
                              >
                                {entry.domains_result.domains &&
                                  entry.domains_result.domains.length > 0 && (
                                    <DomainsResults
                                      domains={entry.domains_result.domains}
                                    />
                                  )}
                              </ResultSection>
                            )}

                            {/* TCP */}
                            {entry.tcp_result && (
                              <ResultSection
                                title="TCP Fat Probe Test"
                                icon={<NetworkIcon />}
                                summary={entry.tcp_result.summary}
                                ok={entry.tcp_result.detected_count === 0}
                              >
                                {entry.tcp_result.targets &&
                                  entry.tcp_result.targets.length > 0 && (
                                    <TCPResults
                                      targets={entry.tcp_result.targets}
                                    />
                                  )}
                              </ResultSection>
                            )}

                            {/* SNI */}
                            {entry.sni_result && (
                              <ResultSection
                                title="SNI Whitelist Brute-Force"
                                icon={<SniIcon />}
                                summary={entry.sni_result.summary}
                                ok={
                                  entry.sni_result.tested_count === 0 ||
                                  entry.sni_result.found_count > 0
                                }
                              >
                                {entry.sni_result.asn_results &&
                                  entry.sni_result.asn_results.length > 0 && (
                                    <SNIResults
                                      results={entry.sni_result.asn_results}
                                    />
                                  )}
                              </ResultSection>
                            )}
                          </Stack>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </B4Card>
                </motion.div>
              );
            })}
          </Stack>
        </B4Section>
      )}
    </Stack>
  );
};
