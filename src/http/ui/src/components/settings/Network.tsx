import { NetworkIcon } from "@b4.icons";
import {
  B4FormGroup,
  B4Section,
  B4TextField,
  B4Slider,
  B4Switch,
  B4Alert,
} from "@b4.elements";
import { B4Config } from "@models/config";

interface NetworkSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: number | boolean | string | string[],
  ) => void;
}

export const NetworkSettings = ({ config, onChange }: NetworkSettingsProps) => {
  const mss = config.queue.mss_clamp ?? { enabled: false, size: 88 };

  return (
    <B4Section
      title="Network Configuration"
      description="Configure netfilter queue and network processing parameters"
      icon={<NetworkIcon />}
    >
      <B4FormGroup label="Queue Settings" columns={2}>
        <B4TextField
          label="Queue Start Number"
          type="number"
          value={config.queue.start_num}
          onChange={(e) => onChange("queue.start_num", Number(e.target.value))}
          helperText="Netfilter queue number (0-65535)"
        />
        <B4TextField
          label="Packet Mark"
          type="number"
          value={config.queue.mark}
          onChange={(e) => onChange("queue.mark", Number(e.target.value))}
          helperText="Netfilter packet mark for iptables rules (default: 32768)"
        />
        <B4Slider
          label="Worker Threads"
          value={config.queue.threads}
          onChange={(value) => onChange("queue.threads", value)}
          min={1}
          max={16}
          step={1}
          helperText="Number of worker threads for processing packets simultaneously (default 4)"
        />
      </B4FormGroup>
      <B4FormGroup label="Global MSS Clamping" columns={2}>
        <B4Switch
          label="Enable Global MSS Clamping"
          checked={mss.enabled}
          onChange={(checked: boolean) =>
            onChange("queue.mss_clamp.enabled", checked)
          }
          description="Clamp MSS on all SYN packets via firewall rules (nftables/iptables)"
        />
        {mss.enabled && (
          <B4Slider
            label="MSS Size"
            value={mss.size}
            onChange={(value: number) =>
              onChange("queue.mss_clamp.size", value)
            }
            min={10}
            max={1460}
            step={1}
            helperText="Lower values = more fragmentation. 88 is commonly used for YouTube bypass."
          />
        )}
        <B4Alert>
          Reduces the TCP Maximum Segment Size on SYN/SYN-ACK packets for all
          TCP port 443 traffic, forcing data fragmentation. Most DPI systems
          cannot reassemble fragmented ClientHello. For per-device MSS clamping,
          use the Device Filtering settings.
        </B4Alert>
      </B4FormGroup>
      <B4FormGroup label="Web Server" columns={2}>
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
      <B4FormGroup label="SOCKS5 Server" columns={2}>
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
