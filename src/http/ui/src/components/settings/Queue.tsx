import { NetworkIcon } from "@b4.icons";
import { B4FormGroup, B4Section, B4TextField, B4Slider } from "@b4.elements";
import { B4Config } from "@models/config";

interface QueueSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: number | boolean | string | string[],
  ) => void;
}

export const QueueSettings = ({ config, onChange }: QueueSettingsProps) => {
  return (
    <B4Section
      title="Queue & Packet Processing"
      description="Configure netfilter queue and packet processing parameters"
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
        <B4Slider
          label="TCP Connection Packets Limit"
          value={config.queue.tcp_conn_bytes_limit}
          onChange={(value) => onChange("queue.tcp_conn_bytes_limit", value)}
          min={1}
          max={100}
          step={1}
          helperText="Max TCP packets per connection to inspect (default 19). Sets cannot exceed this value."
        />
        <B4Slider
          label="UDP Connection Packets Limit"
          value={config.queue.udp_conn_bytes_limit}
          onChange={(value) => onChange("queue.udp_conn_bytes_limit", value)}
          min={1}
          max={30}
          step={1}
          helperText="Max UDP packets per connection to inspect (default 8). Sets cannot exceed this value."
        />
      </B4FormGroup>
    </B4Section>
  );
};
