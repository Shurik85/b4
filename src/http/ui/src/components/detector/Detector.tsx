import { useState, useCallback } from "react";
import { Box, Button, Stack, Typography, CircularProgress } from "@mui/material";
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
} from "@b4.icons";
import { colors } from "@design";
import { B4Alert, B4Section } from "@b4.elements";
import { useDetector } from "@hooks/useDetector";
import type { DetectorTestType } from "@models/detector";

import { TestSelectionGrid } from "./TestSelectionGrid";
import { ProgressGauge } from "./ProgressGauge";
import { SummaryDashboard } from "./SummaryDashboard";
import { ResultSection } from "./ResultSection";
import { DNSResults } from "./results/DNSResults";
import { DomainsResults } from "./results/DomainsResults";
import { TCPResults } from "./results/TCPResults";
import { SNIResults } from "./results/SNIResults";

export const DetectorRunner = () => {
  const {
    running,
    suiteId,
    suite,
    error,
    startDetector,
    cancelDetector,
    resetDetector,
  } = useDetector();

  const [selectedTests, setSelectedTests] = useState<
    Record<DetectorTestType, boolean>
  >({
    dns: true,
    domains: true,
    tcp: true,
    sni: false,
  });

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
    </Stack>
  );
};
