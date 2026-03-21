import * as ipaddr from "ipaddr.js";

export interface AsnInfo {
  id: string;
  name: string;
  prefixes: string[];
}

class AsnStorage {
  private cache: Record<string, AsnInfo> = {};
  private readonly lookupCache = new Map<string, AsnInfo | null>();
  private readonly MAX_CACHE_SIZE = 10000;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.fetchAll();
    await this.loadPromise;
  }

  private async fetchAll(): Promise<void> {
    try {
      const oldData = localStorage.getItem("b4_asn_cache");
      if (oldData) {
        await this.migrateFromLocalStorage(oldData);
      }

      const response = await fetch("/api/asn");
      if (response.ok) {
        const data = (await response.json()) as Record<string, AsnInfo> | null;
        this.cache = data ?? {};
      }
    } catch {
      // keep whatever is in cache
    }
    this.loaded = true;
    this.lookupCache.clear();
  }

  private async migrateFromLocalStorage(data: string): Promise<void> {
    try {
      const parsed = JSON.parse(data) as Record<string, AsnInfo>;
      for (const info of Object.values(parsed)) {
        await fetch("/api/asn", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(info),
        });
      }
      localStorage.removeItem("b4_asn_cache");
    } catch {
      // migration is best-effort
    }
  }

  async addAsn(asnId: string, name: string, prefixes: string[]): Promise<void> {
    const info: AsnInfo = { id: asnId, name, prefixes };
    this.cache[asnId] = info;
    this.lookupCache.clear();

    try {
      await fetch("/api/asn", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
    } catch {
      // keep local cache even if server write fails
    }
  }

  async deleteAsn(asnId: string): Promise<void> {
    delete this.cache[asnId];
    this.lookupCache.clear();

    try {
      await fetch(`/api/asn?id=${encodeURIComponent(asnId)}`, {
        method: "DELETE",
      });
    } catch {
      // keep local state
    }
  }

  getAll(): Record<string, AsnInfo> {
    return { ...this.cache };
  }

  findAsnForIp(ip: string): AsnInfo | null {
    const cleanIp = ip.split(":")[0].replaceAll(/[[\]]/g, "");

    const cached = this.lookupCache.get(cleanIp);
    if (cached !== undefined) {
      this.lookupCache.delete(cleanIp);
      this.lookupCache.set(cleanIp, cached);
      return cached;
    }

    const result = Object.values(this.cache).find((asn) =>
      asn.prefixes.some((prefix) => this.ipInCidr(cleanIp, prefix))
    ) ?? null;

    if (this.lookupCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.lookupCache.keys().next().value;
      if (firstKey) this.lookupCache.delete(firstKey);
    }

    this.lookupCache.set(cleanIp, result);
    return result;
  }

  private ipInCidr(ip: string, cidr: string): boolean {
    try {
      const addr = ipaddr.process(ip);
      const range = ipaddr.parseCIDR(cidr);
      return addr.match(range);
    } catch {
      return false;
    }
  }

  async reload(): Promise<void> {
    this.loaded = false;
    this.loadPromise = null;
    await this.init();
  }
}

export const asnStorage = new AsnStorage();
