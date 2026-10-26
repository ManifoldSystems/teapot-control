import { DurableObject } from "cloudflare:workers";
import { getDevice } from "./helpers/devices";
import {
  type LogFilter,
  levels,
  parseEntries,
  parseFilter,
  type StoredLog,
} from "./helpers/logs";
import type { Bindings } from "./types";

type Viewer = { owner: string; expires: number; filter: LogFilter };
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Log viewers have their own sockets, independent of device presence. */
export class Logs extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS logs (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT, node_id TEXT NOT NULL,
      id TEXT NOT NULL, timestamp INTEGER NOT NULL, level TEXT NOT NULL,
      source TEXT NOT NULL, message TEXT NOT NULL, received_at INTEGER NOT NULL,
      UNIQUE(node_id, id))`);
    // Every statement below must use an index: Durable Objects bill rows
    // read, and a full scan of 10,000 rows per upload exhausted the free tier.
    ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS logs_received ON logs(received_at)"
    );
    ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS logs_node ON logs(node_id, cursor)"
    );
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/kick") {
      const owner = await request.text();
      for (const ws of this.ctx.getWebSockets(owner))
        ws.close(4001, "device revoked");
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/append") {
      const node = request.headers.get("x-teapot-node");
      if (!node) return new Response("missing node", { status: 400 });
      let entries: ReturnType<typeof parseEntries>;
      try {
        entries = parseEntries(await request.json());
      } catch {
        return new Response("invalid entries", { status: 400 });
      }
      if (
        node !== "control" &&
        (await getDevice(this.env.DB, node))?.status !== "approved"
      ) {
        return new Response("device not approved", { status: 403 });
      }
      const stored: StoredLog[] = [];
      this.ctx.storage.transactionSync(() => {
        for (const e of entries) {
          stored.push(
            ...this.ctx.storage.sql
              .exec<StoredLog>(
                "INSERT OR IGNORE INTO logs (node_id,id,timestamp,level,source,message,received_at) VALUES (?,?,?,?,?,?,?) RETURNING *",
                node,
                e.id,
                e.timestamp,
                e.level,
                e.source,
                e.message,
                Date.now()
              )
              .toArray()
          );
        }
      });
      for (const ws of this.ctx.getWebSockets()) {
        const viewer = ws.deserializeAttachment() as Viewer;
        if (viewer.expires <= Date.now()) {
          ws.close(4002, "reauthenticate");
          continue;
        }
        this.send(
          ws,
          stored.filter((e) => this.matches(e, viewer.filter))
        );
      }
      await this.schedule();
      return Response.json({
        success: true,
        data: { accepted: entries.length },
      });
    }
    let filter: LogFilter;
    try {
      filter = parseFilter(url);
    } catch {
      return new Response("invalid filter", { status: 400 });
    }
    if (url.pathname === "/stream") {
      const owner = request.headers.get("x-teapot-viewer");
      if (
        !owner ||
        request.headers.get("upgrade")?.toLowerCase() !== "websocket"
      )
        return new Response("websocket required", { status: 426 });
      if (this.ctx.getWebSockets(owner).length >= 8)
        return new Response("too many viewers", { status: 429 });
      if (
        owner !== "admin" &&
        (await getDevice(this.env.DB, owner))?.status !== "approved"
      ) {
        return new Response("device not approved", { status: 403 });
      }
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server, [owner]);
      server.serializeAttachment({
        owner,
        expires: Date.now() + 3600000,
        filter,
      } satisfies Viewer);
      // Synchronous replay + subscription leaves no history/live gap.
      let page = this.query(filter);
      this.send(server, page, true);
      while (filter.after !== null && page.length === 200) {
        filter = { ...filter, after: page[page.length - 1].cursor };
        page = this.query(filter);
        this.send(server, page);
      }
      await this.schedule();
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({
      success: true,
      data: { entries: this.query(filter) },
    });
  }

  private query(f: LogFilter): StoredLog[] {
    // Separate statements so a device filter can use logs_node.
    const level =
      "(CASE level WHEN 'debug' THEN 0 WHEN 'info' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END) >= ?";
    const order = `ORDER BY cursor ${f.after === null ? "DESC" : "ASC"} LIMIT 200`;
    const rows = (
      f.device
        ? this.ctx.storage.sql.exec<StoredLog>(
            `SELECT * FROM logs WHERE node_id = ? AND ${level} AND cursor > ? ${order}`,
            f.device,
            f.level,
            f.after ?? 0
          )
        : this.ctx.storage.sql.exec<StoredLog>(
            `SELECT * FROM logs WHERE ${level} AND cursor > ? ${order}`,
            f.level,
            f.after ?? 0
          )
    ).toArray();
    return f.after === null ? rows.reverse() : rows;
  }

  private matches(e: StoredLog, f: LogFilter) {
    return (
      (!f.device || e.node_id === f.device) &&
      levels.indexOf(e.level) >= f.level &&
      e.cursor > (f.after ?? 0)
    );
  }

  private send(ws: WebSocket, entries: StoredLog[], empty = false) {
    if (!entries.length && !empty) return;
    try {
      if (!entries.length)
        ws.send(JSON.stringify({ type: "logs", entries: [] }));
      for (let i = 0; i < entries.length; i += 20) {
        ws.send(
          JSON.stringify({ type: "logs", entries: entries.slice(i, i + 20) })
        );
      }
    } catch {
      try {
        ws.close(1011, "viewer disconnected");
      } catch {
        /* already closed */
      }
    }
  }

  /** Runs from the alarm only. Reads about as many rows as it deletes. */
  private prune() {
    this.ctx.storage.sql.exec(
      "DELETE FROM logs WHERE received_at < ?",
      Date.now() - WEEK
    );
    // Cursors only grow, so this keeps at most the newest 10,000.
    this.ctx.storage.sql.exec(
      "DELETE FROM logs WHERE cursor <= (SELECT MAX(cursor) FROM logs) - 10000"
    );
  }

  private async schedule() {
    const next = await this.ctx.storage.getAlarm();
    if (next === null || next > Date.now() + 60000)
      await this.ctx.storage.setAlarm(Date.now() + 60000);
  }

  async alarm() {
    this.prune();
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Viewer).expires <= Date.now())
        ws.close(4002, "reauthenticate");
    }
    await this.ctx.storage.setAlarm(
      Date.now() + (this.ctx.getWebSockets().length ? 60000 : 3600000)
    );
  }

  webSocketMessage() {}
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "socket error");
  }
}
