import { Stack, Typography } from "@mui/material";
import { colors } from "@design";
import type { SNIASNResult } from "@models/detector";
import { ResultCard } from "../ResultCard";
import { StatusChip } from "../StatusChip";

function KVRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography
        variant="caption"
        sx={{
          color: colors.text.secondary,
          minWidth: 80,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </Typography>
      {typeof value === "string" || typeof value === "number" ? (
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
      ) : (
        value
      )}
    </Stack>
  );
}

export function SNIResults({
  results,
}: Readonly<{ results: SNIASNResult[] }>) {
  return (
    <Stack spacing={1}>
      {results.map((r, index) => {
        const status =
          r.status === "FOUND"
            ? "ok"
            : r.status === "NOT_BLOCKED"
              ? "warning"
              : "error";

        return (
          <ResultCard
            key={r.asn}
            index={index}
            status={status as "ok" | "error" | "warning"}
            title={`${r.provider} (AS${r.asn})`}
            subtitle={`IP: ${r.ip}`}
            badge={<StatusChip status={r.status} />}
            expandedContent={
              <Stack spacing={1} sx={{ py: 0.5 }}>
                <KVRow label="ASN" value={`AS${r.asn}`} mono />
                <KVRow label="Provider" value={r.provider} />
                <KVRow label="IP" value={r.ip} mono />
                <KVRow
                  label="Status"
                  value={<StatusChip status={r.status} />}
                />
                {r.found_sni ? (
                  <KVRow
                    label="Found SNI"
                    value={
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          color: "#4caf50",
                          fontWeight: 600,
                        }}
                      >
                        {r.found_sni}
                      </Typography>
                    }
                  />
                ) : (
                  <KVRow
                    label="Found SNI"
                    value={
                      <Typography
                        variant="caption"
                        sx={{ color: colors.text.secondary }}
                      >
                        -
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
