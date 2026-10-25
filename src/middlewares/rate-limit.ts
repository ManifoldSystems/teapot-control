import type { MiddlewareHandler } from "hono";
import { jsonError } from "../helpers/json";
import type { AppEnv } from "../types";

type Limiter = "LOGIN_LIMITER" | "AUTH_LIMITER";

/**
 * Per-IP limit on endpoints that check a secret. The admin token is random
 * today, but a clone's owner may pick a weak password.
 */
export const rateLimit =
  (binding: Limiter): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const limiter = c.env[binding];
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    if (limiter && !(await limiter.limit({ key })).success) {
      c.header("retry-after", "60");
      if (c.req.path === "/login") {
        return c.text("Too many attempts. Wait a minute and try again.", 429);
      }
      return jsonError(c, "too many requests", 429, "RATE_LIMITED");
    }
    await next();
  };
