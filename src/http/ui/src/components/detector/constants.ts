import type { DetectorTestType } from "@models/detector";

export const testNames: Record<DetectorTestType, string> = {
  dns: "DNS Integrity",
  domains: "Domain Accessibility",
  tcp: "TCP Fat Probe",
  sni: "SNI Whitelist Brute-Force",
};

export const testDescriptions: Record<DetectorTestType, string> = {
  dns: "Compares UDP DNS vs DoH to detect spoofing and interception",
  domains: "Probes blocked domains via TLS 1.3, TLS 1.2, and HTTP",
  tcp: "Detects TSPU connection drops via keep-alive requests with increasing header size",
  sni: "Finds bypass SNI values for blocked ASNs by brute-forcing whitelist domains",
};

export const testSequence: DetectorTestType[] = ["dns", "domains", "tcp", "sni"];

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

export const statusColors = {
  ok: "#4caf50",
  error: "#f44336",
  warning: "#F5AD18",
} as const;
