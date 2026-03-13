import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
} from "@mui/material";
import { AddCircleOutline as AddIcon } from "@mui/icons-material";
import { colors } from "@design";
import { formatNumber } from "@utils";
import { B4SetConfig } from "@models/config";
import { setsApi } from "@b4.sets";
import { B4Badge } from "@b4.elements";
import { useTranslation } from "react-i18next";

interface UnmatchedDomainsProps {
  topDomains: Record<string, number>;
  domainTLS: Record<string, string>;
  sets: B4SetConfig[];
  targetedDomains: Set<string>;
  onRefreshSets: () => void;
}

export const UnmatchedDomains = ({
  topDomains,
  domainTLS,
  sets,
  targetedDomains,
  onRefreshSets,
}: UnmatchedDomainsProps) => {
  const { t } = useTranslation();
  const isDomainTargeted = (domain: string): boolean => {
    if (targetedDomains.has(domain)) return true;
    const parts = domain.split(".");
    for (let i = 1; i < parts.length; i++) {
      if (targetedDomains.has(parts.slice(i).join("."))) return true;
    }
    return false;
  };

  const unmatched = useMemo(() => {
    return Object.entries(topDomains)
      .filter(([domain]) => !isDomainTargeted(domain))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDomains, targetedDomains]);

  if (unmatched.length === 0) return null;

  return (
    <Paper
      sx={{
        p: 2,
        bgcolor: colors.background.paper,
        borderColor: colors.border.default,
      }}
      variant="outlined"
    >
      <Typography
        variant="caption"
        sx={{
          color: colors.text.secondary,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: 1.5,
          display: "block",
        }}
      >
        {t("dashboard.unmatchedDomains.title")}
      </Typography>
      <Stack spacing={0.25}>
        {unmatched.map(([domain, count]) => (
          <UnmatchedRow
            key={domain}
            domain={domain}
            count={count}
            tls={domainTLS[domain]}
            sets={sets}
            onAdded={onRefreshSets}
          />
        ))}
      </Stack>
    </Paper>
  );
};

interface UnmatchedRowProps {
  domain: string;
  count: number;
  tls?: string;
  sets: B4SetConfig[];
  onAdded: () => void;
}

const UnmatchedRow = ({
  domain,
  count,
  tls,
  sets,
  onAdded,
}: UnmatchedRowProps) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (setId: string) => {
    setAnchorEl(null);
    setAdding(true);
    try {
      await setsApi.addDomainToSet(setId, domain);
      onAdded();
    } catch (e) {
      console.error("Failed to add domain:", e);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 0.5,
        px: 1,
        borderRadius: 0.5,
        "&:hover": { bgcolor: `${colors.primary}06` },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ minWidth: 0, flex: 1 }}
      >
        {tls && <B4Badge label={tls} color="secondary" title={t("core.tlsVersion")} />}
        <Typography variant="overline">{domain}</Typography>
        <B4Badge label={formatNumber(count)} />
      </Stack>

      <Tooltip title={t("core.addToSet")}>
        <IconButton
          size="small"
          onClick={(e) => {
            setAnchorEl(e.currentTarget);
          }}
          disabled={adding}
          sx={{ color: colors.secondary, ml: 0.5, p: 0.25 }}
        >
          <AddIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          setAnchorEl(null);
        }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: colors.background.default,
              border: `1px solid ${colors.border.default}`,
            },
          },
        }}
      >
        {sets
          .filter((s) => s.enabled)
          .map((set) => (
            <MenuItem
              key={set.id}
              onClick={() => void handleAdd(set.id)}
              sx={{ color: colors.text.primary, fontSize: "0.8rem" }}
            >
              {set.name}
            </MenuItem>
          ))}
      </Menu>
    </Box>
  );
};
