import { useTranslation } from "react-i18next";
import { B4Config } from "@models/config";
import { Grid, Stack } from "@mui/material";
import { ApiIcon } from "@b4.icons";
import { B4TextField, B4Section, B4Alert } from "@b4.elements";

export interface ApiSettingsProps {
  config: B4Config;
  onChange: (field: string, value: boolean | string | number) => void;
}

export const ApiSettings = ({ config, onChange }: ApiSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack spacing={3}>
      <B4Alert icon={<ApiIcon />}>
        {t("settings.Api.alert")}
      </B4Alert>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <B4Section
            title={t("settings.Api.ipinfoTitle")}
            description={t("settings.Api.ipinfoDescription")}
            icon={<ApiIcon />}
          >
            <B4TextField
              label={t("settings.Api.token")}
              value={config.system.api.ipinfo_token}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange("system.api.ipinfo_token", e.target.value)
              }
              helperText={
                <>
                  {t("settings.Api.tokenHelp")}{" "}
                  <a
                    href="https://ipinfo.io/dashboard/token"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("settings.Api.tokenHelpLink")}
                  </a>
                </>
              }
              placeholder={t("settings.Api.tokenPlaceholder")}
            />
          </B4Section>
        </Grid>
      </Grid>
    </Stack>
  );
};
