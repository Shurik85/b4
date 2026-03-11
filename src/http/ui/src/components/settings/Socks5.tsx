import { ConnectionIcon } from "@b4.icons";
import {
  B4FormGroup,
  B4Section,
  B4Switch,
  B4TextField,
  B4Alert,
} from "@b4.elements";
import { B4Config } from "@models/config";

interface Socks5SettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: number | boolean | string | string[],
  ) => void;
}

export const Socks5Settings = ({ config, onChange }: Socks5SettingsProps) => {
  return (
    <B4Section
      title="SOCKS5 Proxy"
      description="Built-in SOCKS5 proxy that routes traffic through DPI bypass engine"
      icon={<ConnectionIcon />}
    >
      <B4FormGroup label="SOCKS5 Settings" columns={2}>
        <B4Switch
          label="Enable SOCKS5 Proxy"
          checked={config.system.socks5?.enabled ?? false}
          onChange={(checked: boolean) =>
            onChange("system.socks5.enabled", checked)
          }
          description="Built-in SOCKS5 proxy that routes traffic through DPI bypass engine"
        />
        <B4TextField
          label="Bind Address"
          value={config.system.socks5?.bind_address || "0.0.0.0"}
          onChange={(e) =>
            onChange("system.socks5.bind_address", e.target.value)
          }
          placeholder="0.0.0.0"
          disabled={!config.system.socks5?.enabled}
          helperText="IP to bind (0.0.0.0 = all, 127.0.0.1 = localhost only)"
        />
        <B4TextField
          label="Port"
          type="number"
          value={config.system.socks5?.port ?? 1080}
          onChange={(e) =>
            onChange("system.socks5.port", Number(e.target.value))
          }
          disabled={!config.system.socks5?.enabled}
          helperText="SOCKS5 listen port (default: 1080)"
        />
        <B4TextField
          label="Username"
          value={config.system.socks5?.username || ""}
          onChange={(e) => onChange("system.socks5.username", e.target.value)}
          disabled={!config.system.socks5?.enabled}
          helperText="Leave empty for no authentication"
        />
        <B4TextField
          label="Password"
          value={config.system.socks5?.password || ""}
          onChange={(e) => onChange("system.socks5.password", e.target.value)}
          disabled={!config.system.socks5?.enabled}
          helperText="Leave empty for no authentication"
        />
        {config.system.socks5?.enabled && (
          <B4Alert severity="info">
            Restart B4 after changing SOCKS5 settings for changes to take
            effect.
          </B4Alert>
        )}
      </B4FormGroup>
    </B4Section>
  );
};
