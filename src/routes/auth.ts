import { Hono } from "hono";
import { sign } from "hono/jwt";
import { checkChallenge, issueChallenge } from "../helpers/challenge";
import { verifyEd25519 } from "../helpers/crypto";
import { touchDevice } from "../helpers/devices";
import { isNodeId } from "../helpers/hex";
import { jsonError, jsonOk } from "../helpers/json";
import type { AppEnv } from "../types";

export const DEVICE_TOKEN_TTL_SECONDS = 60 * 60 * 24;

/**
 * Device login without passwords: the node id is an Ed25519 public key, so a
 * signature over our challenge proves the caller holds the iroh secret key.
 */
export const authRoutes = new Hono<AppEnv>()
  .post("/v1/auth/challenge", async (c) => {
    const started = performance.now();
    const body = await c.req.json<{ node_id?: unknown }>().catch(() => ({}));
    const nodeId = (body as { node_id?: unknown }).node_id;
    if (!isNodeId(nodeId)) {
      return jsonError(
        c,
        "node_id must be 64 lowercase hex chars",
        400,
        "BAD_REQUEST"
      );
    }
    return jsonOk(
      c,
      await issueChallenge(c.env.CONTROL_SECRET as string, nodeId),
      started
    );
  })
  .post("/v1/auth/verify", async (c) => {
    const started = performance.now();
    const body = await c.req
      .json<{ node_id?: unknown; challenge?: unknown; signature?: unknown }>()
      .catch(() => ({}) as Record<string, unknown>);
    const { node_id: nodeId, challenge, signature } = body;
    if (
      !isNodeId(nodeId) ||
      typeof challenge !== "string" ||
      typeof signature !== "string"
    ) {
      return jsonError(
        c,
        "node_id, challenge and signature are required",
        400,
        "BAD_REQUEST"
      );
    }

    const secret = c.env.CONTROL_SECRET as string;
    const problem = await checkChallenge(secret, nodeId, challenge);
    if (problem) return jsonError(c, problem, 401, "UNAUTHORIZED");
    if (!(await verifyEd25519(nodeId, challenge, signature))) {
      return jsonError(c, "bad signature", 401, "UNAUTHORIZED");
    }

    const device = await touchDevice(
      c.env.DB,
      nodeId,
      c.req.header("cf-connecting-ip") ?? null
    );
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      {
        sub: nodeId,
        aud: "device",
        iat: now,
        exp: now + DEVICE_TOKEN_TTL_SECONDS,
      },
      secret,
      "HS256"
    );
    return jsonOk(
      c,
      {
        token,
        expires_at: now + DEVICE_TOKEN_TTL_SECONDS,
        status: device?.status ?? "pending",
      },
      started
    );
  });
