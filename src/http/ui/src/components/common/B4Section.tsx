import { Box, Paper, Typography, Divider } from "@mui/material";
import { colors } from "@design";

interface B4SectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const B4Section = ({
  title,
  description,
  icon,
  children,
}: B4SectionProps) => {
  return (
    <Paper
      sx={{
        p: 3,
        bgcolor: colors.background.paper,
        border: `1px solid ${colors.border.default}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
      variant="outlined"
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        {icon && (
          <Box
            sx={{
              mr: 2,
              p: 1.5,
              borderRadius: 2,
              bgcolor: colors.accent.primary,
              color: colors.primary,
              display: "flex",
              alignItems: "center",
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="h6" sx={{ color: colors.text.primary }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="caption" sx={{ color: colors.text.secondary }}>
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider sx={{ mb: 2, borderColor: colors.border.light }} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {children}
      </Box>
    </Paper>
  );
};

export default B4Section;
