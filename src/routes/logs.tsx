import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { listDevices } from "../helpers/devices";
import { jsonError } from "../helpers/json";
import { logsStub, parseEntries, parseFilter } from "../helpers/logs";
import { adminAuth } from "../middlewares/admin-auth";
import { deviceAuth, requireApproved } from "../middlewares/device-auth";
import type { AppEnv } from "../types";
import { LogsPage } from "../views/logs";

export const logRoutes = new Hono<AppEnv>()
  .use("/v1/logs", deviceAuth, requireApproved)
  .use("/v1/logs/*", deviceAuth, requireApproved)
  .use("/admin/logs", adminAuth)
  .use("/admin/logs.json", adminAuth)
  .use("/admin/logs/*", adminAuth)
  .post("/v1/logs", bodyLimit({ maxSize: 128 * 1024 }), async (c) => {
    let entries: ReturnType<typeof parseEntries>;
    try {
      entries = parseEntries(await c.req.json());
    } catch {
      return jsonError(c, "Invalid log batch", 400, "BAD_LOGS");
    }
    return logsStub(c.env).fetch("https://logs/append", {
      method: "POST",
      headers: { "x-teapot-node": c.get("nodeId") },
      body: JSON.stringify({ entries }),
    });
  })
  .get("/admin/logs", async (c) =>
    c.html(
      <LogsPage
        devices={await listDevices(c.env.DB)}
        device={c.req.query("device") ?? ""}
      />
    )
  );

for (const path of [
  "/v1/logs",
  "/admin/logs.json",
  "/v1/logs/stream",
  "/admin/logs/stream",
]) {
  logRoutes.get(path, async (c) => {
    const url = new URL(c.req.url);
    try {
      parseFilter(url);
    } catch {
      return jsonError(c, "Invalid log filter", 400, "BAD_FILTER");
    }
    const stream = path.endsWith("/stream");
    const headers = new Headers();
    if (stream) {
      headers.set("upgrade", c.req.header("upgrade") ?? "");
      headers.set(
        "x-teapot-viewer",
        path.startsWith("/admin/") ? "admin" : c.get("nodeId")
      );
    }
    return logsStub(c.env).fetch(
      `https://logs/${stream ? "stream" : "history"}${url.search}`,
      { headers }
    );
  });
}
