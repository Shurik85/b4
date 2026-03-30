import { useState } from "react";
import { Button, Grid } from "@mui/material";
import { useTranslation } from "react-i18next";
import SettingSection from "@common/B4Section";
import { ControlIcon, RestartIcon, InfoIcon } from "@b4.icons";
import { RestartDialog } from "./RestartDialog";
import { SystemInfoDialog } from "./SystemInfoDialog";
import { spacing } from "@design";

export const ControlSettings = () => {
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showSysInfoDialog, setShowSysInfoDialog] = useState(false);
  const { t } = useTranslation();

  return (
    <SettingSection
      title={t("settings.Control.title")}
      description={t("settings.Control.description")}
      icon={<ControlIcon />}
    >
      <Grid container spacing={spacing.lg}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RestartIcon />}
          onClick={() => setShowRestartDialog(true)}
        >
          {t("settings.Control.restartService")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<InfoIcon />}
          onClick={() => setShowSysInfoDialog(true)}
        >
          {t("settings.Control.systemInfo")}
        </Button>
      </Grid>

      <RestartDialog
        open={showRestartDialog}
        onClose={() => setShowRestartDialog(false)}
      />

      <SystemInfoDialog
        open={showSysInfoDialog}
        onClose={() => setShowSysInfoDialog(false)}
      />
    </SettingSection>
  );
};
