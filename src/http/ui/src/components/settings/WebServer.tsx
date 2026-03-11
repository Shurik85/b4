import { ApiIcon } from "@b4.icons";
import { B4FormGroup, B4Section, B4TextField } from "@b4.elements";
import { B4Config } from "@models/config";

interface WebServerSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: number | boolean | string | string[],
  ) => void;
}

export const WebServerSettings = ({
  config,
  onChange,
}: WebServerSettingsProps) => {
  return (
    <B4Section
      title="Web Server"
      description="Configure the web UI server binding and TLS"
      icon={<ApiIcon />}
    >
      <B4FormGroup label="Server Settings" columns={2}>
        <B4TextField
          label="Bind Address"
          value={config.system.web_server.bind_address || "0.0.0.0"}
          onChange={(e) =>
            onChange("system.web_server.bind_address", e.target.value)
          }
          placeholder="0.0.0.0"
          helperText="IP to bind (0.0.0.0 = all, 127.0.0.1 = localhost only, :: = all IPv6)"
        />
        <B4TextField
          label="Port"
          type="number"
          value={config.system.web_server.port}
          onChange={(e) =>
            onChange("system.web_server.port", Number(e.target.value))
          }
          helperText="Web UI port (default: 7000)"
        />
        <B4TextField
          label="TLS Certificate"
          value={config.system.web_server.tls_cert || ""}
          onChange={(e) =>
            onChange("system.web_server.tls_cert", e.target.value)
          }
          placeholder="/path/to/server.crt"
          helperText="Path to TLS certificate file (empty = HTTP mode)"
        />
        <B4TextField
          label="TLS Key"
          value={config.system.web_server.tls_key || ""}
          onChange={(e) =>
            onChange("system.web_server.tls_key", e.target.value)
          }
          placeholder="/path/to/server.key"
          helperText="Path to TLS private key file (empty = HTTP mode)"
        />
      </B4FormGroup>
    </B4Section>
  );
};
