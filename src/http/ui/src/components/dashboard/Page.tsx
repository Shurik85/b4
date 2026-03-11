import { useEffect, useState, useRef } from "react";
import {
  Box,
  Container,
  Typography,
  LinearProgress,
  Paper,
} from "@mui/material";
import { HealthBanner } from "./HealthBanner";
import { MetricsCards } from "./MetricsCards";
import { ActiveSets } from "./ActiveSets";
import { DeviceActivity } from "./DeviceActivity";
import { UnmatchedDomains } from "./UnmatchedDomains";
import { SimpleLineChart } from "./SimpleLineChart";
import { colors } from "@design";
import { useDashboardSets } from "@hooks/useDashboardSets";
import { wsUrl } from "@utils";

export interface Metrics {
  total_connections: number;
  active_flows: number;
  packets_processed: number;
  bytes_processed: number;
  tcp_connections: number;
  udp_connections: number;
  targeted_connections: number;
  connection_rate: { timestamp: number; value: number }[];
  packet_rate: { timestamp: number; value: number }[];
  top_domains: Record<string, number>;
  protocol_dist: Record<string, number>;
  geo_dist: Record<string, number>;
  start_time: string;
  uptime: string;
  cpu_usage: number;
  memory_usage: {
    allocated: number;
    total_allocated: number;
    system: number;
    num_gc: number;
    heap_alloc: number;
    heap_inuse: number;
    percent: number;
  };
  worker_status: Array<{
    id: number;
    status: string;
    processed: number;
  }>;
  nfqueue_status: string;
  tables_status: string;
  recent_connections: Array<{
    timestamp: string;
    protocol: "TCP" | "UDP";
    domain: string;
    source: string;
    destination: string;
    is_target: boolean;
    source_mac?: string;
    host_set?: string;
  }>;
  recent_events: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  device_domains: Record<string, Record<string, number>>;
  domain_tls: Record<string, string>;
  current_cps: number;
  current_pps: number;
}

const safeNumber = (val: number, defaultValue: number = 0): number => {
  if (val === null || val === undefined) return defaultValue;
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return defaultValue;
  if (num > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (num < Number.MIN_SAFE_INTEGER) return Number.MIN_SAFE_INTEGER;
  return num;
};

const normalizeMetrics = (data: null | Metrics): Metrics => {
  if (!data || typeof data !== "object") {
    return {
      total_connections: 0,
      active_flows: 0,
      packets_processed: 0,
      bytes_processed: 0,
      tcp_connections: 0,
      udp_connections: 0,
      targeted_connections: 0,
      connection_rate: [],
      packet_rate: [],
      top_domains: {},
      protocol_dist: {},
      geo_dist: {},
      start_time: new Date().toISOString(),
      uptime: "0s",
      cpu_usage: 0,
      memory_usage: {
        allocated: 0,
        total_allocated: 0,
        system: 0,
        num_gc: 0,
        heap_alloc: 0,
        heap_inuse: 0,
        percent: 0,
      },
      worker_status: [],
      nfqueue_status: "unknown",
      tables_status: "unknown",
      recent_connections: [],
      recent_events: [],
      device_domains: {},
      domain_tls: {},
      current_cps: 0,
      current_pps: 0,
    };
  }

  return {
    total_connections: safeNumber(data.total_connections),
    active_flows: safeNumber(data.active_flows),
    packets_processed: safeNumber(data.packets_processed),
    bytes_processed: safeNumber(data.bytes_processed),
    tcp_connections: safeNumber(data.tcp_connections),
    udp_connections: safeNumber(data.udp_connections),
    targeted_connections: safeNumber(data.targeted_connections),
    connection_rate: Array.isArray(data.connection_rate)
      ? data.connection_rate.map(
          (item: { timestamp: number; value: number }) => ({
            timestamp: safeNumber(item?.timestamp),
            value: safeNumber(item?.value),
          }),
        )
      : [],
    packet_rate: Array.isArray(data.packet_rate)
      ? data.packet_rate.map((item: { timestamp: number; value: number }) => ({
          timestamp: safeNumber(item?.timestamp),
          value: safeNumber(item?.value),
        }))
      : [],
    top_domains:
      data.top_domains && typeof data.top_domains === "object"
        ? Object.fromEntries(
            Object.entries(data.top_domains).map(([k, v]) => [
              String(k),
              safeNumber(v),
            ]),
          )
        : {},
    protocol_dist:
      data.protocol_dist && typeof data.protocol_dist === "object"
        ? Object.fromEntries(
            Object.entries(data.protocol_dist).map(([k, v]) => [
              String(k),
              safeNumber(v),
            ]),
          )
        : {},
    geo_dist:
      data.geo_dist && typeof data.geo_dist === "object"
        ? Object.fromEntries(
            Object.entries(data.geo_dist).map(([k, v]) => [
              String(k),
              safeNumber(v),
            ]),
          )
        : {},
    start_time: String(data.start_time ?? new Date().toISOString()),
    uptime: String(data.uptime ?? "0s"),
    cpu_usage: safeNumber(data.cpu_usage),
    memory_usage: {
      allocated: safeNumber(data?.memory_usage?.allocated),
      total_allocated: safeNumber(data?.memory_usage?.total_allocated),
      system: safeNumber(data?.memory_usage?.system),
      num_gc: safeNumber(data?.memory_usage?.num_gc),
      heap_alloc: safeNumber(data?.memory_usage?.heap_alloc),
      heap_inuse: safeNumber(data?.memory_usage?.heap_inuse),
      percent: safeNumber(data?.memory_usage?.percent),
    },
    worker_status: Array.isArray(data.worker_status)
      ? data.worker_status.map(
          (w: { id: number; status: string; processed: number }) => ({
            id: safeNumber(w.id),
            status: String(w.status ?? "unknown"),
            processed: safeNumber(w.processed),
          }),
        )
      : [],
    nfqueue_status: String(data.nfqueue_status ?? "unknown"),
    tables_status: String(data.tables_status ?? "unknown"),
    recent_connections: Array.isArray(data.recent_connections)
      ? data.recent_connections.map(
          (conn: {
            timestamp?: string;
            protocol?: "TCP" | "UDP";
            domain?: string;
            source?: string;
            destination?: string;
            is_target?: boolean;
          }) => ({
            timestamp: String(conn?.timestamp ?? ""),
            protocol:
              conn?.protocol === "TCP" || conn?.protocol === "UDP"
                ? conn.protocol
                : ("TCP" as "TCP" | "UDP"),
            domain: String(conn?.domain ?? ""),
            source: String(conn?.source ?? ""),
            destination: String(conn?.destination ?? ""),
            is_target: Boolean(conn?.is_target),
          }),
        )
      : [],
    recent_events: Array.isArray(data.recent_events)
      ? data.recent_events.map(
          (evt: { timestamp?: string; level?: string; message?: string }) => ({
            timestamp: String(evt?.timestamp ?? ""),
            level: String(evt?.level ?? ""),
            message: String(evt?.message ?? ""),
          }),
        )
      : [],
    device_domains:
      data.device_domains && typeof data.device_domains === "object"
        ? Object.fromEntries(
            Object.entries(data.device_domains).map(([mac, domains]) => [
              String(mac),
              domains && typeof domains === "object"
                ? Object.fromEntries(
                    Object.entries(domains).map(([d, c]) => [
                      String(d),
                      safeNumber(c),
                    ]),
                  )
                : {},
            ]),
          )
        : {},
    domain_tls:
      data.domain_tls && typeof data.domain_tls === "object"
        ? Object.fromEntries(
            Object.entries(data.domain_tls).map(([k, v]) => [
              String(k),
              String(v ?? ""),
            ]),
          )
        : {},
    current_cps: safeNumber(data.current_cps),
    current_pps: safeNumber(data.current_pps),
  };
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { sets, targetedDomains, refresh: refreshSets } = useDashboardSets();

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then((data: { version?: string }) => {
        if (data?.version) setVersion(data.version);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket(wsUrl("/api/ws/metrics"));

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data =
            typeof event.data === "string"
              ? (JSON.parse(event.data) as Metrics)
              : normalizeMetrics(null);
          setMetrics(normalizeMetrics(data));
        } catch {
          setMetrics(normalizeMetrics(null));
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  if (!metrics) {
    return (
      <Container maxWidth={false} sx={{ py: 3 }}>
        <Box sx={{ textAlign: "center", py: 8 }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography>Loading dashboard...</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ p: 2 }}>
      <HealthBanner metrics={metrics} connected={connected} version={version} />

      <Box sx={{ mb: 1.5 }}>
        <MetricsCards metrics={metrics} />
      </Box>

      <ActiveSets sets={sets} />

      <DeviceActivity
        deviceDomains={metrics.device_domains}
        domainTLS={metrics.domain_tls}
        sets={sets}
        targetedDomains={targetedDomains}
        onRefreshSets={refreshSets}
      />

      <UnmatchedDomains
        topDomains={metrics.top_domains}
        domainTLS={metrics.domain_tls}
        sets={sets}
        targetedDomains={targetedDomains}
        onRefreshSets={refreshSets}
      />

      {metrics.connection_rate.length > 0 && (
        <Paper
          sx={{
            p: 2,
            mt: 1.5,
            bgcolor: colors.background.paper,
            borderColor: colors.border.default,
          }}
          variant="outlined"
        >
          <Typography
            variant="caption"
            sx={{
              color: colors.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              mb: 1,
              display: "block",
            }}
          >
            Connection Rate
          </Typography>
          <SimpleLineChart
            data={metrics.connection_rate}
            color={colors.primary}
            height={120}
          />
        </Paper>
      )}
    </Container>
  );
}
