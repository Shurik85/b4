import { Box, Grid, Stack, Typography } from "@mui/material";
import { motion } from "motion/react";
import { DnsIcon, DomainIcon, NetworkIcon, SniIcon } from "@b4.icons";
import { colors, spacing, radius } from "@design";
import { B4Card } from "@common/B4Card";
import type { DetectorSuite } from "@models/detector";
import { staggerContainer, staggerItem, statusColors } from "./constants";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}

function SummaryCard({ title, value, subtitle, icon, color }: SummaryCardProps) {
  return (
    <B4Card
      variant="outlined"
      sx={{
        border: `1px solid ${color}33`,
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: `${color}66`,
          boxShadow: `0 0 20px ${color}22`,
        },
      }}
    >
      <Box sx={{ p: spacing.md }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color: colors.text.secondary,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="h4"
              sx={{
                color: colors.text.primary,
                fontWeight: 600,
                mt: 0.5,
                mb: 0.5,
              }}
            >
              {value}
            </Typography>
            <Typography variant="caption" sx={{ color: colors.text.secondary }}>
              {subtitle}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.5,
              borderRadius: radius.lg,
              bgcolor: `${color}22`,
              color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 56,
              minHeight: 56,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </Box>
    </B4Card>
  );
}

export function SummaryDashboard({
  suite,
}: Readonly<{ suite: DetectorSuite }>) {
  const cards: SummaryCardProps[] = [];

  if (suite.dns_result) {
    const r = suite.dns_result;
    const bad = r.spoof_count + r.intercept_count;
    cards.push({
      title: "DNS Integrity",
      value: bad > 0 ? `${bad} Issue${bad > 1 ? "s" : ""}` : "All OK",
      subtitle: r.summary,
      icon: <DnsIcon sx={{ fontSize: 28 }} />,
      color: bad > 0 ? statusColors.error : statusColors.ok,
    });
  }

  if (suite.domains_result) {
    const r = suite.domains_result;
    cards.push({
      title: "Domain Access",
      value:
        r.blocked_count > 0
          ? `${r.blocked_count} Blocked`
          : "All OK",
      subtitle: r.summary,
      icon: <DomainIcon sx={{ fontSize: 28 }} />,
      color: r.blocked_count > 0 ? statusColors.error : statusColors.ok,
    });
  }

  if (suite.tcp_result) {
    const r = suite.tcp_result;
    cards.push({
      title: "TSPU Detection",
      value: r.detected_count > 0 ? `${r.detected_count} Detected` : "Clean",
      subtitle: r.summary,
      icon: <NetworkIcon sx={{ fontSize: 28 }} />,
      color: r.detected_count > 0 ? statusColors.error : statusColors.ok,
    });
  }

  if (suite.sni_result) {
    const r = suite.sni_result;
    cards.push({
      title: "SNI Brute-Force",
      value:
        r.found_count > 0
          ? `${r.found_count} Found`
          : r.tested_count > 0
            ? "None Found"
            : "Not Blocked",
      subtitle: r.summary,
      icon: <SniIcon sx={{ fontSize: 28 }} />,
      color:
        r.found_count > 0
          ? statusColors.ok
          : r.tested_count > 0
            ? statusColors.warning
            : statusColors.ok,
    });
  }

  if (cards.length === 0) return null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, md: cards.length <= 2 ? 6 : 3 }}>
            <motion.div variants={staggerItem}>
              <SummaryCard {...card} />
            </motion.div>
          </Grid>
        ))}
      </Grid>
    </motion.div>
  );
}
