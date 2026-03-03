import { Stack, Typography } from "@mui/material";
import { colors } from "@design";
import { B4Badge } from "@b4.elements";
import type { TCPTargetResult } from "@models/detector";
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

export function TCPResults({
  targets,
}: Readonly<{ targets: TCPTargetResult[] }>) {
  return (
    <Stack spacing={1}>
      {targets.map((t, index) => {
        const status =
          t.status === "OK"
            ? "ok"
            : t.status === "DETECTED"
              ? "error"
              : "warning";

        return (
          <ResultCard
            key={t.target.id}
            index={index}
            status={status as "ok" | "error" | "warning"}
            title={`${t.target.provider} (AS${t.target.asn})`}
            subtitle={`${t.target.ip}:${t.target.port}`}
            badge={
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <B4Badge
                  label={t.alive ? "Alive" : "Dead"}
                  size="small"
                  color={t.alive ? "primary" : "error"}
                />
                <StatusChip status={t.status} />
              </Stack>
            }
            expandedContent={
              <Stack spacing={1} sx={{ py: 0.5 }}>
                <KVRow
                  label="Endpoint"
                  value={`${t.target.ip}:${t.target.port}`}
                  mono
                />
                <KVRow label="ASN" value={`AS${t.target.asn}`} mono />
                <KVRow
                  label="Alive"
                  value={
                    <B4Badge
                      label={t.alive ? "Yes" : "No"}
                      size="small"
                      color={t.alive ? "primary" : "error"}
                    />
                  }
                />
                {t.drop_at_kb != null && (
                  <KVRow label="Drop at" value={`${t.drop_at_kb} KB`} mono />
                )}
                {t.rtt_ms != null && (
                  <KVRow label="RTT" value={`${t.rtt_ms} ms`} mono />
                )}
                {t.target.sni && (
                  <KVRow label="SNI" value={t.target.sni} mono />
                )}
                {t.detail && (
                  <KVRow
                    label="Detail"
                    value={
                      <Typography
                        variant="caption"
                        sx={{ color: colors.text.secondary }}
                      >
                        {t.detail}
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
