import { FragIcon } from "@b4.icons";
import {
  B4FormGroup,
  B4Section,
  B4Slider,
  B4Switch,
  B4Alert,
} from "@b4.elements";
import { B4Config } from "@models/config";

interface MSSClampingSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: number | boolean | string | string[],
  ) => void;
}

export const MSSClampingSettings = ({
  config,
  onChange,
}: MSSClampingSettingsProps) => {
  const mss = config.queue.mss_clamp ?? { enabled: false, size: 88 };

  return (
    <B4Section
      title="Global MSS Clamping"
      description="Clamp TCP Maximum Segment Size to force data fragmentation"
      icon={<FragIcon />}
    >
      <B4FormGroup label="MSS Settings" columns={2}>
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
      </B4FormGroup>
      <B4Alert>
        Reduces the TCP Maximum Segment Size on SYN/SYN-ACK packets for all TCP
        port 443 traffic, forcing data fragmentation. Most DPI systems cannot
        reassemble fragmented ClientHello. For per-device MSS clamping, use the
        Device Filtering settings.
      </B4Alert>
    </B4Section>
  );
};
