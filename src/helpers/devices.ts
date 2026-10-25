import type { Device } from "../types";

export const getDevice = (db: D1Database, nodeId: string) =>
  db
    .prepare("SELECT * FROM devices WHERE node_id = ?")
    .bind(nodeId)
    .first<Device>();

export const listDevices = async (db: D1Database) => {
  const { results } = await db
    .prepare("SELECT * FROM devices ORDER BY status DESC, created_at")
    .all<Device>();
  return results ?? [];
};

/** First successful auth creates the device as pending. */
export const touchDevice = async (
  db: D1Database,
  nodeId: string,
  ip: string | null
) => {
  await db
    .prepare(
      `INSERT INTO devices (node_id, last_ip, last_seen_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT (node_id) DO UPDATE SET
         last_ip = excluded.last_ip,
         last_seen_at = excluded.last_seen_at`
    )
    .bind(nodeId, ip)
    .run();
  return getDevice(db, nodeId);
};

export const markSeen = (db: D1Database, nodeId: string) =>
  db
    .prepare(
      "UPDATE devices SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_id = ?"
    )
    .bind(nodeId)
    .run();

export const publicDevice = (d: Device) => ({
  node_id: d.node_id,
  name: d.name,
  platform: d.platform,
  status: d.status,
  can_exit: d.can_exit === 1,
  exit_enabled: d.exit_enabled === 1,
  last_ip: d.last_ip,
  public_ipv4: d.public_ipv4,
  public_ipv6: d.public_ipv6,
  created_at: d.created_at,
  last_seen_at: d.last_seen_at,
});
