import { B4Badge } from "@b4.elements";
import { CheckCircleIcon, WarningIcon } from "@b4.icons";
import { colors } from "@design";
import { statusColors } from "./constants";

export function StatusChip({
  status,
  label,
}: Readonly<{ status: string; label?: string }>) {
  const display = label || status;
  let color: "primary" | "error" | "info" | "secondary" | "default" = "default";

  switch (status) {
    case "OK":
      color = "primary";
      break;
    case "DNS_SPOOFING":
    case "TLS_DPI":
    case "DETECTED":
    case "BLOCKED":
      color = "error";
      break;
    case "DNS_INTERCEPTION":
    case "TLS_MITM":
    case "ISP_PAGE":
    case "DNS_FAKE":
    case "MIXED":
    case "NOT_FOUND":
      color = "secondary";
      break;
    case "FOUND":
      color = "primary";
      break;
    case "NOT_BLOCKED":
    case "TIMEOUT":
    case "ERROR":
      color = "info";
      break;
  }

  return <B4Badge label={display} size="small" color={color} />;
}

export function SummaryIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircleIcon sx={{ color: statusColors.ok, fontSize: 20 }} />
  ) : (
    <WarningIcon sx={{ color: statusColors.error, fontSize: 20 }} />
  );
}
