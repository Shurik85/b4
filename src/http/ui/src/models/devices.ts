import { B4Config, DeviceMSSClamp } from "@b4.settings";

export interface DeviceInfo {
  mac: string;
  ip: string;
  hostname: string;
  vendor: string;
  alias?: string;
  country: string;
}

export interface DevicesResponse {
  available: boolean;
  source?: string;
  devices: DeviceInfo[];
}

export interface DevicesSettingsProps {
  config: B4Config;
  onChange: (
    field: string,
    value: boolean | string | string[] | number | DeviceMSSClamp[],
  ) => void;
}
