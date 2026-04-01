import { Stack } from "@mui/material";
import { TcpIcon, UdpIcon, BlockIcon } from "@b4.icons";
import { B4Badge } from "@b4.elements";

interface ProtocolChipProps {
  protocol: "TCP" | "UDP" | "P-TCP" | "P-UDP";
  flags?: string;
}

export const ProtocolChip = ({ protocol, flags }: ProtocolChipProps) => {
  const baseProtocol = protocol.replace("P-", "") as "TCP" | "UDP";
  const icon = baseProtocol === "TCP" ? <TcpIcon /> : <UdpIcon />;
  const isBlocked = flags?.startsWith("ipblock");

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <B4Badge
        icon={icon}
        label={protocol}
        variant="outlined"
        color={baseProtocol === "TCP" ? "primary" : "secondary"}
      />
      {isBlocked && (
        <B4Badge
          icon={<BlockIcon />}
          label="ip"
          title="Blocked by IP"
          variant={flags === "ipblock-cached" ? "outlined" : "filled"}
          color="error"
        />
      )}
    </Stack>
  );
};
