export type Bindings = CloudflareBindings & {
  /** HMAC key for auth challenges, device tokens, and the admin cookie. */
  CONTROL_SECRET?: string;
  /** Password for the dashboard until Cloudflare Access is in front of it. */
  ADMIN_TOKEN?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    nodeId: string;
  };
};

export type DeviceStatus = "pending" | "approved";

export type Device = {
  node_id: string;
  name: string | null;
  platform: string | null;
  status: DeviceStatus;
  can_exit: number;
  exit_enabled: number;
  last_ip: string | null;
  created_at: string;
  last_seen_at: string | null;
};

/** What a device reports over its presence socket. */
export type PeerPath = {
  peer: string;
  kind: "direct" | "relay";
  rtt_ms: number;
};

export type OnlineDevice = {
  node_id: string;
  connected_at: string;
  paths: PeerPath[];
};
