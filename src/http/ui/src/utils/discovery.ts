import { B4SetConfig } from "@models/config";
import { StrategyFamily, DiscoveryResult } from "@models/discovery";

export interface StrategyGroup {
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

export function groupByStrategy(
  results: Record<string, DiscoveryResult>,
): { success: StrategyGroup[]; failed: DiscoveryResult[] } {
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
    if (!groups[family].representativeSet && bestResult.set) {
      groups[family].representativeSet = bestResult.set;
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
}

export function formatTimeAgo(
  t: (key: string, opts?: Record<string, unknown>) => string,
  dateStr: string,
  fallback?: string,
): string {
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
