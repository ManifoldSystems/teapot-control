import { DurableObject } from "cloudflare:workers";
import { markSeen } from "./helpers/devices";
import type { Bindings, OnlineDevice, PeerPath, PeerTraffic } from "./types";

type Attachment = {
  node_id: string;
  connected_at: string;
  paths: PeerPath[];
  traffic?: PeerTraffic[];
  ips?: { v4: string | null; v6: string | null };
};

const MAX_PATHS = 64;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;

/**
 * Online = has an open socket here. Uses the hibernation API, so idle sockets
 * cost nothing; per-socket state lives in the attachment, which survives
 * hibernation.
 */
export class Presence extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/connect") {
      const nodeId = request.headers.get("x-teapot-node");
      if (!nodeId) return new Response("missing node", { status: 400 });
      const ip = request.headers.get("x-teapot-ip") || null;

      // One socket per device; a reconnect replaces the old one.
      for (const old of this.ctx.getWebSockets(nodeId)) {
        old.close(4000, "replaced by a newer connection");
      }

      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server, [nodeId]);
      server.serializeAttachment({
        node_id: nodeId,
        connected_at: new Date().toISOString(),
        paths: [],
      } satisfies Attachment);
      await this.env.DB.prepare(
        "UPDATE devices SET last_ip = COALESCE(?, last_ip), last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_id = ?"
      )
        .bind(ip, nodeId)
        .run();
      this.peersChanged();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (pathname === "/sockets") {
      // Debug view for the dashboard admin: every socket, open or not.
      return Response.json(
        this.ctx.getWebSockets().map((ws) => ({
          ready_state: ws.readyState,
          tags: this.ctx.getTags(ws),
          attachment: ws.deserializeAttachment(),
        }))
      );
    }

    if (pathname === "/online") {
      // A replaced socket can linger here while it closes; its attachment
      // holds stale paths/traffic. Count open sockets only, newest per device.
      const newest = new Map<string, OnlineDevice>();
      for (const ws of this.ctx.getWebSockets()) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const a = ws.deserializeAttachment() as Attachment | null;
        if (!a) continue;
        const seen = newest.get(a.node_id);
        if (!seen || seen.connected_at < a.connected_at)
          newest.set(a.node_id, a);
      }
      return Response.json([...newest.values()]);
    }

    if (pathname === "/broadcast" && request.method === "POST") {
      this.broadcast(await request.text());
      return new Response(null, { status: 204 });
    }

    if (pathname === "/kick" && request.method === "POST") {
      const nodeId = await request.text();
      for (const ws of this.ctx.getWebSockets(nodeId)) {
        ws.close(4001, "removed from control");
      }
      return new Response(null, { status: 204 });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let msg: {
      type?: unknown;
      paths?: unknown;
      traffic?: unknown;
      ips?: { v4?: unknown; v6?: unknown };
    };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg.type === "status" && Array.isArray(msg.paths)) {
      const attachment = ws.deserializeAttachment() as Attachment;
      attachment.paths = msg.paths
        .filter(
          (p): p is PeerPath =>
            typeof p?.peer === "string" &&
            (p.kind === "direct" || p.kind === "relay") &&
            typeof p.rtt_ms === "number"
        )
        .slice(0, MAX_PATHS);
      attachment.traffic = (Array.isArray(msg.traffic) ? msg.traffic : [])
        .filter(
          (t): t is PeerTraffic =>
            typeof t?.peer === "string" &&
            Number.isFinite(t.tx) &&
            Number.isFinite(t.rx)
        )
        .slice(0, MAX_PATHS);
      const ips = {
        v4:
          typeof msg.ips?.v4 === "string" && IPV4.test(msg.ips.v4)
            ? msg.ips.v4
            : null,
        v6:
          typeof msg.ips?.v6 === "string" && IPV6.test(msg.ips.v6)
            ? msg.ips.v6
            : null,
      };
      const changed =
        (ips.v4 || ips.v6) &&
        (attachment.ips?.v4 !== ips.v4 || attachment.ips?.v6 !== ips.v6);
      attachment.ips = ips;
      ws.serializeAttachment(attachment);
      // D1 only when the addresses change, not on every 5 s status.
      if (changed) {
        await this.env.DB.prepare(
          "UPDATE devices SET public_ipv4 = ?, public_ipv6 = ? WHERE node_id = ?"
        )
          .bind(ips.v4, ips.v6, attachment.node_id)
          .run();
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    await this.offline(ws);
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.offline(ws);
  }

  private async offline(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (attachment) await markSeen(this.env.DB, attachment.node_id);
    this.peersChanged();
  }

  /** Online/offline changes which exit nodes clients may pick. */
  private peersChanged() {
    this.broadcast(JSON.stringify({ type: "peers_changed" }));
  }

  private broadcast(message: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // closing socket; webSocketClose will clean up
      }
    }
  }
}
