import { useState, useEffect } from "react";
import { B4Config } from "@models/config";

export function useConfigLoad() {
  const [config, setConfig] = useState<B4Config | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Failed to load configuration");
        const data = (await response.json()) as B4Config;
        setConfig(data);
      } catch (error) {
        console.error("Error loading config:", error);
      }
    };

    void fetchConfig();
  }, []);

  return { config };
}

