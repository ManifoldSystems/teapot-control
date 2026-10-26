import { Hono } from "hono";
import {
  displayName,
  getDevice,
  listDevices,
  publicDevice,
} from "../helpers/devices";
import { jsonError, jsonOk } from "../helpers/json";
import {
  broadcastPeersChanged,
  fetchOnline,
  presenceStub,
} from "../helpers/presence";
import { deviceAuth, requireApproved } from "../middlewares/device-auth";
import type { AppEnv } from "../types";

const MAX_NAME = 64;

export const deviceRoutes = new Hono<AppEnv>()
  .use("/v1/devices/*", deviceAuth)
  .use("/v1/peers", deviceAuth, requireApproved)
  .use("/v1/exit/*", deviceAuth, requireApproved)
  .use("/v1/presence", deviceAuth)

  .get("/v1/devices/me", async (c) => {
    const started = performance.now();
    const device = await getDevice(c.env.DB, c.get("nodeId"));
    if (!device)
      return jsonError(
        c,
        "device removed; authenticate again",
        401,
        "UNAUTHORIZED"
      );
    return jsonOk(c, publicDevice(device), started);
  })

  .put("/v1/devices/me", async (c) => {
    const started = performance.now();
    const body = await c.req
      .json<{
        name?: unknown;
        platform?: unknown;
        model?: unknown;
        can_exit?: unknown;
      }>()
      .catch(() => ({}) as Record<string, unknown>);
    const name =
      typeof body.name === "string"
        ? body.name.trim().slice(0, MAX_NAME)
        : null;
    const platform =
      typeof body.platform === "string"
        ? body.platform.trim().slice(0, MAX_NAME)
        : null;
    const model =
      typeof body.model === "string"
        ? body.model.trim().slice(0, MAX_NAME)
        : null;
    // can_exit is what the device offers right now; exit_enabled is the
    // owner's choice and survives the device restarting without exit.
    // Omitted can_exit keeps the stored value.
    const canExit =
      typeof body.can_exit === "boolean" ? (body.can_exit ? 1 : 0) : null;

    const nodeId = c.get("nodeId");
    const { meta } = await c.env.DB.prepare(
      "UPDATE devices SET name = COALESCE(?, name), platform = COALESCE(?, platform), model = COALESCE(?, model), can_exit = COALESCE(?, can_exit) WHERE node_id = ?"
    )
      .bind(name, platform, model, canExit, nodeId)
      .run();
    if (!meta.changes)
      return jsonError(
        c,
        "device removed; authenticate again",
        401,
        "UNAUTHORIZED"
      );

    await broadcastPeersChanged(c.env);
    const device = await getDevice(c.env.DB, nodeId);
    return jsonOk(c, device ? publicDevice(device) : null, started);
  })

  .get("/v1/peers", async (c) => {
    const started = performance.now();
    const [devices, online] = await Promise.all([
      listDevices(c.env.DB),
      fetchOnline(c.env),
    ]);
    const onlineIds = new Set(online.map((o) => o.node_id));
    const me = c.get("nodeId");
    const peers = devices
      .filter((d) => d.status === "approved" && d.node_id !== me)
      .map((d) => ({
        node_id: d.node_id,
        // The alias wins, so --exit / via= can use it.
        name: displayName(d),
        device_name: d.name,
        model: d.model,
        platform: d.platform,
        agent_version: d.agent_version,
        agent_protocol: d.agent_protocol,
        online: onlineIds.has(d.node_id),
        exit: d.can_exit === 1 && d.exit_enabled === 1,
        // Lets a client skip exits that would leave with its own IP.
        public_ipv4: d.public_ipv4,
      }));
    return jsonOk(c, peers, started);
  })

  /** For an exit node: which endpoint ids may use it. */
  .get("/v1/exit/allowlist", async (c) => {
    const started = performance.now();
    const me = c.get("nodeId");
    const devices = await listDevices(c.env.DB);
    const self = devices.find((d) => d.node_id === me);
    const enabled = self?.can_exit === 1 && self.exit_enabled === 1;
    const allow = enabled
      ? devices
          .filter((d) => d.status === "approved" && d.node_id !== me)
          .map((d) => d.node_id)
      : [];
    return jsonOk(c, { exit_enabled: enabled, allow }, started);
  })

  .get("/v1/presence", async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return jsonError(
        c,
        "expected a WebSocket upgrade",
        426,
        "UPGRADE_REQUIRED"
      );
    }
    const nodeId = c.get("nodeId");
    if (!(await getDevice(c.env.DB, nodeId))) {
      return jsonError(
        c,
        "device removed; authenticate again",
        401,
        "UNAUTHORIZED"
      );
    }
    const headers = new Headers(c.req.raw.headers);
    const version = c.req.header("x-teapot-version");
    const protocol = c.req.header("x-teapot-protocol");
    if (version !== undefined && !/^[A-Za-z0-9.+_-]{1,64}$/.test(version))
      return jsonError(c, "invalid agent version", 400, "BAD_VERSION");
    if (protocol !== undefined && protocol !== "1")
      return jsonError(
        c,
        "unsupported presence protocol",
        426,
        "UNSUPPORTED_PROTOCOL"
      );
    await c.env.DB.prepare(
      "UPDATE devices SET agent_version = ?, agent_protocol = ? WHERE node_id = ?"
    )
      .bind(version ?? null, protocol === "1" ? 1 : null, nodeId)
      .run();
    headers.set("x-teapot-node", nodeId);
    headers.set("x-teapot-ip", c.req.header("cf-connecting-ip") ?? "");
    return presenceStub(c.env).fetch("https://presence/connect", { headers });
  });
