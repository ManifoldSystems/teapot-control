-- One row per device. node_id is the iroh endpoint id (hex Ed25519 public key).
CREATE TABLE devices (
  node_id TEXT PRIMARY KEY,
  name TEXT,
  platform TEXT,
  -- pending until approved from the dashboard; pending devices see no peers
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  -- can_exit: the device says it is able to; exit_enabled: the owner allows it
  can_exit INTEGER NOT NULL DEFAULT 0,
  exit_enabled INTEGER NOT NULL DEFAULT 0,
  -- public IP as seen by Cloudflare on the last auth or presence connect
  last_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_seen_at TEXT
);
