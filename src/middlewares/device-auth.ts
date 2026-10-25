import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import { getDevice } from "../helpers/devices";
import { isNodeId } from "../helpers/hex";
import { jsonError } from "../helpers/json";
import type { AppEnv } from "../types";

const bearer = (header: string | undefined, query: string | undefined) => {
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  // WebSocket clients in some runtimes cannot set headers.
  return query?.trim() || null;
};

/** Device token from /v1/auth/verify. Sets `nodeId`. */
export const deviceAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("authorization"), c.req.query("token"));
  if (!token) {
    return jsonError(c, "device token required", 401, "UNAUTHORIZED");
  }
  try {
    const payload = await verify(
      token,
      c.env.CONTROL_SECRET as string,
      "HS256"
    );
    if (payload.aud !== "device" || !isNodeId(payload.sub)) throw new Error();
    c.set("nodeId", payload.sub);
  } catch {
    return jsonError(c, "invalid or expired token", 401, "UNAUTHORIZED");
  }
  await next();
};

/** Must run after deviceAuth. Removed devices lose access immediately. */
export const requireApproved: MiddlewareHandler<AppEnv> = async (c, next) => {
  const device = await getDevice(c.env.DB, c.get("nodeId"));
  if (!device) {
    return jsonError(
      c,
      "device removed; authenticate again",
      401,
      "UNAUTHORIZED"
    );
  }
  if (device.status !== "approved") {
    return jsonError(c, "device is pending approval", 403, "PENDING");
  }
  await next();
};
