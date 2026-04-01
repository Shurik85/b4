import { ParsedLog } from "@b4.logs";

export const SORT_STORAGE_KEY = "b4_domains_sort";

export interface DomainSortState {
  column: string | null;
  direction: "asc" | "desc" | null;
}

export function loadSortState(): DomainSortState {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as DomainSortState;
    }
  } catch (e) {
    console.error("Failed to load sort state:", e);
  }
  return { column: null, direction: null };
}

export function saveSortState(
  column: string | null,
  direction: "asc" | "desc" | null,
): void {
  try {
    localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify({ column, direction }),
    );
  } catch (e) {
    console.error("Failed to save sort state:", e);
  }
}

export function parseSniLogLine(line: string): ParsedLog | null {
  const tokens = line.trim().trim().split(",");
  if (tokens.length < 7) {
    return null;
  }

  const [
    timestamp,
    protocol,
    hostSet,
    domain,
    source,
    ipSet,
    destination,
    sourceAlias,
    tls,
    flags,
  ] = tokens;

  return {
    timestamp: timestamp.replaceAll(" [INFO]", "").trim().split(".")[0],
    protocol: protocol as "TCP" | "UDP",
    hostSet,
    domain,
    source,
    ipSet,
    destination,
    sourceAlias: sourceAlias ?? "",
    deviceName: "",
    tls: tls ?? "",
    flags: flags ?? "",
    raw: line,
  };
}

export function generateDomainVariants(domain: string): string[] {
  const parts = domain.split(".");
  const variants: string[] = [];

  for (let i = 0; i < parts.length - 1; i++) {
    variants.push(parts.slice(i).join("."));
  }

  return variants;
}

export function generateIpVariants(ip: string): string[] {
  if (ip.startsWith("[")) {
    const addr = ip.split("]")[0].substring(1);
    return generateIpv6Variants(addr);
  }

  if (ip.includes(":") && ip.split(":").length > 2) {
    return generateIpv6Variants(ip);
  }

  const parts = ip.split(":")[0].split(".");

  if (
    parts.length !== 4 ||
    parts.some((p) => {
      const num = Number.parseInt(p, 10);
      return Number.isNaN(num) || num < 0 || num > 255;
    })
  ) {
    return [];
  }

  return [
    `${parts.join(".")}/32`,
    `${parts.slice(0, 3).join(".")}.0/24`,
    `${parts.slice(0, 2).join(".")}.0.0/16`,
    `${parts[0]}.0.0.0/8`,
  ];
}

function generateIpv6Variants(ip: string): string[] {
  return [`${ip}/128`, `${ip}/64`, `${ip}/48`, `${ip}/32`];
}

export const STORAGE_KEY = "b4_domains_lines";
export const MAX_STORED_LINES = 1000;

export function loadPersistedLines(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    }
  } catch (e) {
    console.error("Failed to load persisted domains:", e);
  }
  return [];
}

export function persistLogLines(lines: string[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(lines.slice(-MAX_STORED_LINES)),
    );
  } catch (e) {
    console.error("Failed to persist domains:", e);
  }
}

export function clearLogPersistedLines(): void {
  localStorage.removeItem(STORAGE_KEY);
}
