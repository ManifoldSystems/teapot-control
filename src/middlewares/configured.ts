import type { MiddlewareHandler } from "hono";
import { jsonError } from "../helpers/json";
import type { AppEnv } from "../types";

export const requireConfigured: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.CONTROL_SECRET || c.env.CONTROL_SECRET.length < 32) {
    return jsonError(
      c,
      "CONTROL_SECRET is not configured",
      503,
      "NOT_CONFIGURED"
    );
  }
  await next();
};
