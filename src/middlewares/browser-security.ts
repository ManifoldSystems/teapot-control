import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export const browserSecurity: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("Cache-Control", "no-store");
  if (
    !c.req.path.startsWith("/v1/") &&
    (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
      c.req.header("upgrade")?.toLowerCase() === "websocket")
  ) {
    const origin = c.req.header("origin");
    const site = c.req.header("sec-fetch-site");
    if (
      (origin !== undefined && origin !== new URL(c.req.url).origin) ||
      (site !== undefined && site !== "same-origin" && site !== "none")
    ) {
      return c.text("Cross-origin request forbidden", 403);
    }
  }
  await next();
};
