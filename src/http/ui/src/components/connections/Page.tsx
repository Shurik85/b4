import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Container, Fab, Paper, Tooltip } from "@mui/material";
import { StartIcon, StopIcon } from "@b4.icons";
import { DomainsControlBar } from "./ControlBar";
import { AddSniModal } from "./AddSniModal";
import { DomainsTable, SortColumn } from "./Table";
import { SortDirection } from "@common/SortableTableCell";
import {
  useDomainActions,
  useParsedLogs,
  useEnrichedLogs,
  useFilteredLogs,
  useSortedLogs,
  clearAsnLookupCache,
} from "@hooks/useDomainActions";
import { useIpActions } from "@hooks/useIpActions";
import {
  generateDomainVariants,
  loadSortState,
  saveSortState,
  generateIpVariants,
  asnStorage,
} from "@utils";
import { colors } from "@design";
import { useWebSocket } from "../../context/B4WsProvider";
import { AddIpModal } from "./AddIpModal";
import { B4Config, B4SetConfig } from "@models/config";
import { useSnackbar } from "@context/SnackbarProvider";
import { devicesApi } from "@b4.devices";
import { useTranslation } from "react-i18next";

const MAX_DISPLAY_ROWS = 1000;

interface RipeNetworkInfo {
  asns: string[];
  prefix: string;
}

async function resolveAsn(ip: string, token: string): Promise<{ id: string; name: string } | null> {
  if (token) {
    const response = await fetch(`/api/integration/ipinfo?ip=${encodeURIComponent(ip)}`);
    if (response.ok) {
      const data = (await response.json()) as { org?: string };
      const match = data.org ? /AS(\d+)/.exec(data.org) : null;
      if (match) return { id: match[1], name: data.org! };
    }
  }

  const response = await fetch(`/api/integration/ripestat?ip=${encodeURIComponent(ip)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { data: RipeNetworkInfo };
  const asnId = data.data?.asns?.[0];
  return asnId ? { id: asnId, name: `AS${asnId}` } : null;
}

async function fetchAsnPrefixes(asnId: string): Promise<string[] | null> {
  const response = await fetch(`/api/integration/ripestat/asn?asn=${encodeURIComponent(asnId)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { data: { prefixes: Array<{ prefix: string }> } };
  return data.data.prefixes.map((p) => p.prefix);
}

export function ConnectionsPage() {
  const { t } = useTranslation();
  const {
    domains,
    pauseDomains,
    showAll,
    setShowAll,
    setPauseDomains,
    clearDomains,
    resetDomainsBadge,
  } = useWebSocket();

  const [filter, setFilter] = useState(() => {
    return localStorage.getItem("b4_connections_filter") || "";
  });

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(() => {
    const saved = loadSortState();
    return saved.column as SortColumn | null;
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    const saved = loadSortState();
    return saved.direction;
  });

  const { modalState, openModal, closeModal, selectVariant, addDomain } =
    useDomainActions();

  const {
    modalState: modalIpState,
    openModal: openIpModal,
    closeModal: closeIpModal,
    selectVariant: selectIpVariant,
    addIp,
  } = useIpActions();
  const { showSuccess, showError } = useSnackbar();

  const [availableSets, setAvailableSets] = useState<B4SetConfig[]>([]);
  const [ipInfoToken, setIpInfoToken] = useState<string>("");
  const [devicesEnabled, setDevicesEnabled] = useState<boolean>(false);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});
  const [enrichingIps, setEnrichingIps] = useState<Set<string>>(new Set());
  const [asnVersion, setAsnVersion] = useState(0);

  useEffect(() => {
    localStorage.setItem("b4_connections_filter", filter);
  }, [filter]);

  useEffect(() => {
    saveSortState(sortColumn, sortDirection);
  }, [sortColumn, sortDirection]);

  // Limit displayed rows for performance
  const recentDomains = useMemo(
    () => domains.slice(-MAX_DISPLAY_ROWS),
    [domains]
  );

  const parsedLogs = useParsedLogs(recentDomains, showAll);
  const enrichedLogs = useEnrichedLogs(parsedLogs, deviceMap);
  const filteredLogs = useFilteredLogs(enrichedLogs, filter);
  const sortedData = useSortedLogs(filteredLogs, sortColumn, sortDirection);

  useEffect(() => {
    if (!devicesEnabled) {
      setDeviceMap({});
      return;
    }
    devicesApi
      .list()
      .then((data) => {
        const map: Record<string, string> = {};
        for (const d of data.devices || []) {
          const normalized = d.mac.toUpperCase().replace(/-/g, ":");
          map[normalized] = d.alias || d.vendor || "";
        }
        setDeviceMap(map);
      })
      .catch(() => {});
  }, [devicesEnabled]);

  const fetchSets = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/config", { signal });
      if (response.ok) {
        const data = (await response.json()) as B4Config;
        if (data.sets && Array.isArray(data.sets)) {
          setAvailableSets(data.sets);
        }
        if (data.system?.api?.ipinfo_token) {
          setIpInfoToken(data.system.api.ipinfo_token);
        }
        setDevicesEnabled(data.queue?.devices?.enabled || data.queue?.devices?.vendor_lookup || false);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Failed to fetch sets:", error);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSets(controller.signal);
    void asnStorage.init();
    return () => {
      controller.abort();
    };
  }, [fetchSets]);

  const handleScrollStateChange = useCallback(() => {}, []);

  const handleSort = useCallback((column: SortColumn) => {
    setSortColumn((prevColumn) => {
      if (prevColumn === column) {
        setSortDirection((prevDir) => {
          if (prevDir === "asc") return "desc";
          if (prevDir === "desc") {
            setSortColumn(null);
            return null;
          }
          return "asc";
        });
        return prevColumn;
      }
      setSortDirection("asc");
      return column;
    });
  }, []);

  const handleClearSort = useCallback(() => {
    setSortColumn(null);
    setSortDirection(null);
  }, []);

  const handleEnrichIp = useCallback(async (ip: string) => {
    const cleanIp = ip.split(":")[0].replaceAll(/[[\]]/g, "");
    setEnrichingIps((prev) => new Set(prev).add(cleanIp));
    try {
      const asn = await resolveAsn(cleanIp, ipInfoToken);
      if (!asn) {
        showError(t("connections.table.enrichNoAsn"));
        return;
      }
      const prefixes = await fetchAsnPrefixes(asn.id);
      if (!prefixes) {
        showError(t("connections.table.enrichFailed"));
        return;
      }
      await asnStorage.addAsn(asn.id, asn.name, prefixes);
      clearAsnLookupCache();
      setAsnVersion((v) => v + 1);
      showSuccess(t("connections.table.enrichSuccess", { asn: asn.name, count: prefixes.length }));
    } catch {
      showError(t("connections.table.enrichFailed"));
    } finally {
      setEnrichingIps((prev) => {
        const next = new Set(prev);
        next.delete(cleanIp);
        return next;
      });
    }
  }, [ipInfoToken, showSuccess, showError, t]);

  const handleDeleteAsn = useCallback((asnId: string) => {
    void (async () => {
      await asnStorage.deleteAsn(asnId);
      clearAsnLookupCache();
      setAsnVersion((v) => v + 1);
      showSuccess(t("connections.table.asnDeleted", { asn: asnId }));
    })();
  }, [showSuccess, t]);

  const handleIpClick = useCallback(
    (ip: string) => {
      const variants = generateIpVariants(ip);
      openIpModal(ip, variants);
    },
    [openIpModal]
  );

  const handleDomainClick = useCallback(
    (domain: string) => {
      const variants = generateDomainVariants(domain);
      openModal(domain, variants);
    },
    [openModal]
  );

  const handleHotkeysDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey && e.key === "x") || e.key === "Delete") {
        e.preventDefault();
        clearDomains();
        resetDomainsBadge();
        showSuccess(t("connections.page.clearedAll"));
      } else if (e.key === "p" || e.key === "Pause") {
        e.preventDefault();
        setPauseDomains(!pauseDomains);
        showSuccess(pauseDomains ? t("connections.page.resumed") : t("connections.page.paused"));
      }
    },
    [
      clearDomains,
      pauseDomains,
      setPauseDomains,
      resetDomainsBadge,
      showSuccess,
    ]
  );

  useEffect(() => {
    globalThis.window.addEventListener("keydown", handleHotkeysDown);
    return () => {
      globalThis.window.removeEventListener("keydown", handleHotkeysDown);
    };
  }, [handleHotkeysDown]);

  return (
    <Container
      maxWidth={false}
      sx={{
        flex: 1,
        py: 3,
        px: 3,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid",
          borderColor: pauseDomains
            ? colors.border.strong
            : colors.border.default,
          transition: "border-color 0.3s",
        }}
      >
        <DomainsControlBar
          filter={filter}
          onFilterChange={setFilter}
          totalCount={enrichedLogs.length}
          filteredCount={filteredLogs.length}
          sortColumn={sortColumn}
          showAll={showAll}
          onShowAllChange={setShowAll}
          onClearSort={handleClearSort}
          onReset={clearDomains}
        />

        <Box sx={{ position: "relative", flex: 1, overflow: "hidden", display: "flex" }}>
          <DomainsTable
            data={sortedData}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            onDomainClick={handleDomainClick}
            onIpClick={handleIpClick}
            onEnrichIp={handleEnrichIp}
            onDeleteAsn={handleDeleteAsn}
            enrichingIps={enrichingIps}
            asnVersion={asnVersion}
            onScrollStateChange={handleScrollStateChange}
          />

          <Tooltip title={pauseDomains ? t("connections.page.resumeStreaming") : t("connections.page.pauseStreaming")} placement="left">
            <Fab
              size="small"
              onClick={() => setPauseDomains(!pauseDomains)}
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                bgcolor: pauseDomains ? colors.secondary : colors.border.strong,
                color: colors.background.default,
                "&:hover": {
                  bgcolor: pauseDomains ? colors.secondary : colors.border.default,
                },
              }}
            >
              {pauseDomains ? <StartIcon /> : <StopIcon />}
            </Fab>
          </Tooltip>
        </Box>
      </Paper>

      <AddSniModal
        open={modalState.open}
        domain={modalState.domain}
        variants={modalState.variants}
        selected={modalState.selected}
        onClose={closeModal}
        onSelectVariant={selectVariant}
        sets={availableSets}
        onAdd={(...args) => {
          void (async () => {
            await addDomain(...args);
            await fetchSets();
          })();
        }}
      />

      <AddIpModal
        open={modalIpState.open}
        ip={modalIpState.ip}
        variants={modalIpState.variants}
        selected={modalIpState.selected as string}
        sets={availableSets}
        ipInfoToken={ipInfoToken}
        onClose={closeIpModal}
        onSelectVariant={selectIpVariant}
        onAdd={(...args) => {
          void (async () => {
            await addIp(...args);
            await fetchSets();
          })();
        }}
        onAddHostname={(hostname) => {
          const variants = generateDomainVariants(hostname);
          openModal(hostname, variants);
        }}
      />
    </Container>
  );
}
