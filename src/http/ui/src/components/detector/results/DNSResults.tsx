import { Box, Stack, Typography } from "@mui/material";
import { colors } from "@design";
import { B4Badge } from "@b4.elements";
import type { DNSDomainResult } from "@models/detector";
import { ResultCard } from "../ResultCard";
import { StatusChip } from "../StatusChip";

function DetailRow({
  label,
  value,
  mono,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}>) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography
        variant="caption"
        sx={{
          color: colors.text.secondary,
          minWidth: 60,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: colors.text.primary,
          fontFamily: mono ? "monospace" : "inherit",
          fontSize: mono ? "0.8rem" : undefined,
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export function DNSResults({
  domains,
}: Readonly<{ domains: DNSDomainResult[] }>) {
  return (
    <Stack spacing={1}>
      {domains.map((d, index) => {
        const status =
          d.status === "OK"
            ? "ok"
            : d.status === "TIMEOUT"
              ? "warning"
              : "error";

        return (
          <ResultCard
            key={d.domain}
            index={index}
            status={status}
            title={d.domain}
            subtitle={`DoH: ${d.doh_ip} | UDP: ${d.udp_ip}`}
            badge={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {d.is_stub_ip && (
                  <B4Badge label="STUB" size="small" color="error" />
                )}
                <StatusChip status={d.status} />
              </Box>
            }
            expandedContent={
              <Stack spacing={1} sx={{ py: 0.5 }}>
                <DetailRow label="DoH IP" value={d.doh_ip} mono />
                <DetailRow label="UDP IP" value={d.udp_ip} mono />
                <DetailRow
                  label="Status"
                  value={<StatusChip status={d.status} />}
                />
                {d.is_stub_ip && (
                  <DetailRow
                    label="Note"
                    value={
                      <Typography
                        variant="caption"
                        sx={{ color: statusColors.error }}
                      >
                        Stub/sinkhole IP detected
                      </Typography>
                    }
                  />
                )}
              </Stack>
            }
          />
        );
      })}
    </Stack>
  );
}

const statusColors = {
  error: "#f44336",
};
