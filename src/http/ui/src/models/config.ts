export type FakingStrategy =
  | "ttl"
  | "pastseq"
  | "randseq"
  | "tcp_check"
  | "md5sum"
  | "timestamp";

export enum FakingPayloadType {
  RANDOM = 0,
  CUSTOM = 1,
  DEFAULT = 2,
  DEFAULT2 = 3,
  CAPTURE = 4,
  ZERO = 5,
  INVERTED = 6,
}

export type MutationMode =
  | "off"
  | "random"
  | "grease"
  | "padding"
  | "fakeext"
  | "fakesni"
  | "advanced";
export interface SNIMutationConfig {
  mode: MutationMode;
  grease_count: number;
  padding_size: number;
  fake_ext_count: number;
  fake_snis: string[];
}

export interface FakingConfig {
  strategy: FakingStrategy;
  sni: boolean;
  ttl: number;
  seq_offset: number;
  sni_seq_length: number;
  sni_type: FakingPayloadType;
  custom_payload: string;
  sni_mutation: SNIMutationConfig;
  payload_file: string;
  tls_mod: string[];
  tcp_md5: boolean;
  timestamp_decrease: number;
}
export type FragmentationStrategy =
  | "tcp"
  | "ip"
  | "tls"
  | "oob"
  | "disorder"
  | "extsplit"
  | "firstbyte"
  | "combo"
  | "hybrid"
  | "none";
export interface FragmentationConfig {
  strategy: FragmentationStrategy;
  sni_position: number;
  reverse_order: boolean;
  middle_sni: boolean;
  oob_position: number;
  oob_char: number;

  tlsrec_pos: number;

  seq_overlap_pattern: string[];

  combo: ComboFragConfig;
  disorder: DisorderFragConfig;
}

export enum LogLevel {
  ERROR = 0,
  INFO = 1,
  TRACE = 2,
  DEBUG = 3,
}

export interface LoggingConfig {
  level: LogLevel;
  instaflush: boolean;
  syslog: boolean;
  error_file: string;
}

export interface TargetsConfig {
  sni_domains: string[];
  ip: string[];
  geosite_categories: string[];
  geoip_categories: string[];
  source_devices?: string[];
  tls?: string;
}

export interface DomainStatisticsConfig {
  manual_domains: number;
  geosite_domains: number;
  total_domains: number;
  category_breakdown?: Record<string, number>;
  geosite_available: boolean;
}

export interface CategoryPreviewConfig {
  category: string;
  total_domains: number;
  preview_count: number;
  preview: string[];
}

export type UdpMode = "drop" | "fake";
export type UdpFilterQuicMode = "disabled" | "all" | "parse";
export type UdpFakingStrategy = "none" | "ttl" | "checksum";

export interface UdpConfig {
  mode: UdpMode;
  fake_seq_length: number;
  fake_len: number;
  faking_strategy: UdpFakingStrategy;
  dport_filter: string;
  filter_quic: UdpFilterQuicMode;
  conn_bytes_limit: number;
  filter_stun: boolean;
  seg2delay: number;
  seg2delay_max: number;
}
export interface QueueConfig {
  start_num: number;
  threads: number;
  mark: number;
  ipv4: boolean;
  ipv6: boolean;
  tcp_conn_bytes_limit: number;
  udp_conn_bytes_limit: number;
  interfaces: string[];
  devices: DevicesConfig;
  mss_clamp: MSSClampConfig;
}

export interface DevicesConfig {
  mac: string[];
  enabled: boolean;
  vendor_lookup: boolean;
  wisb: boolean;
  mss_clamps: DeviceMSSClamp[];
}

export interface DeviceMSSClamp {
  mac: string;
  size: number;
}

export interface DiscoveryConfig {
  discovery_timeout: number;
  config_propagate_ms: number;
  reference_domain: string;
  reference_dns: string[];
  validation_tries: number;
}

export type WindowMode = "off" | "oscillate" | "zero" | "random" | "escalate";
export type DesyncMode = "off" | "rst" | "fin" | "ack" | "combo" | "full";
export type IncomingMode = "off" | "fake" | "reset" | "fin" | "desync";
export type IncomingStrategy = "badsum" | "badseq" | "badack" | "rand" | "all";

export interface TcpConfig {
  conn_bytes_limit: number;
  seg2delay: number;
  seg2delay_max: number;
  syn_fake: boolean;
  syn_fake_len: number;
  syn_ttl: number;
  drop_sack: boolean;
  dport_filter: string;

  desync: DesyncConfig;
  win: WinConfig;
  incoming: IncomingConfig;
  duplicate?: DuplicateConfig;
}

export interface IncomingConfig {
  mode: IncomingMode;
  min: number;
  max: number;
  fake_ttl: number;
  fake_count: number;
  strategy: IncomingStrategy;
}

export interface WinConfig {
  mode: WindowMode;
  values: number[];
}

export interface DesyncConfig {
  mode: DesyncMode;
  ttl: number;
  count: number;
  post_desync: boolean;
}

export interface WebServerConfig {
  port: number;
  bind_address: string;
  tls_cert: string;
  tls_key: string;
  username: string;
  password: string;
  language: string;
}
export interface TableConfig {
  monitor_interval: number;
  skip_setup: boolean;
  engine: string;
  masquerade: boolean;
  masquerade_interface: string;
}

export interface GeoConfig {
  sitedat_url: string;
  ipdat_url: string;
  sitedat_path: string;
  ipdat_path: string;
}

export interface ApiConfig {
  ipinfo_token: string;
}

export interface Socks5Config {
  enabled: boolean;
  port: number;
  bind_address: string;
  username: string;
  password: string;
  udp_timeout: number;
  udp_read_timeout: number;
}

export interface SystemConfig {
  logging: LoggingConfig;
  web_server: WebServerConfig;
  socks5: Socks5Config;
  tables: TableConfig;
  checker: DiscoveryConfig;
  geo: GeoConfig;
  api: ApiConfig;
  timezone: string;
}

export interface B4Config {
  queue: QueueConfig;
  system: SystemConfig;
  sets: B4SetConfig[];
  available_ifaces: string[];
}

export interface B4SetConfig {
  id: string;
  name: string;
  enabled: boolean;

  tcp: TcpConfig;
  udp: UdpConfig;
  fragmentation: FragmentationConfig;
  faking: FakingConfig;
  targets: TargetsConfig;
  dns: DNSConfig;
  routing: RoutingConfig;
}

export type ComboShuffleMode = "middle" | "full" | "reverse";
export interface ComboFragConfig {
  first_byte_split: boolean;
  extension_split: boolean;
  shuffle_mode: ComboShuffleMode;
  first_delay_ms: number;
  jitter_max_us: number;
  decoy_enabled: boolean;
  fake_per_segment: boolean;
  fake_per_seg_count: number;
}

export type DisorderShuffleMode = "full" | "reverse";
export interface DisorderFragConfig {
  shuffle_mode: DisorderShuffleMode;
  min_jitter_us: number;
  max_jitter_us: number;
  fake_per_segment: boolean;
  fake_per_seg_count: number;
}

export interface DNSConfig {
  enabled: boolean;
  target_dns: string;
  fragment_query: boolean;
}

export interface RoutingConfig {
  enabled: boolean;
  egress_interface: string;
  fwmark: number;
  table: number;
  source_interfaces: string[];
  ip_ttl_seconds: number;
}

export interface DuplicateConfig {
  enabled: boolean;
  count: number;
}

export interface MSSClampConfig {
  enabled: boolean;
  size: number;
}

export const NEW_SET_ID = "00000000-0000-0000-0000-000000000000";
