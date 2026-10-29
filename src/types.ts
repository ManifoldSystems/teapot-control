export type Bindings = Omit<
  CloudflareBindings,
  "PRESENCE_GENERATION" | "PREVIOUS_PRESENCE_GENERATION"
> & {
  PRESENCE_GENERATION: string;
  PREVIOUS_PRESENCE_GENERATION: string;
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
  public_ipv4: string | null;
  public_ipv6: string | null;
  alias: string | null;
  model: string | null;
  agent_version: string | null;
  agent_protocol: number | null;
};

/** What a device reports over its presence socket. */
export type PeerPath = {
  peer: string;
  kind: "direct" | "relay";
  rtt_ms: number;
  /**
   * The selected path's remote address: the peer's socket address when direct,
   * the relay host when relay. Optional — legacy agents never send it.
   */
  addr?: string | null;
};

/**
 * The last path control saw for a `(device, peer)` pair, kept outside the
 * socket attachment so it survives the connection closing. `peer` is the other
 * device; the owning device is the storage key.
 */
export type StoredPath = {
  peer: string;
  kind: "direct" | "relay";
  rtt_ms: number;
  addr: string | null;
  seen_at: string;
};

/** Tunnel bytes since the device's agent started, from its side. */
export type PeerTraffic = {
  peer: string;
  tx: number;
  rx: number;
};

export type OnlineDevice = {
  node_id: string;
  connected_at: string;
  paths: PeerPath[];
  traffic?: PeerTraffic[];
};
