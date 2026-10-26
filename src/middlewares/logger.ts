import type { MiddlewareHandler } from "hono";
import { controlLog } from "../helpers/logs";
import type { AppEnv } from "../types";

export const logger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now();
  await next();
  const path = new URL(c.req.url).pathname;
  console.log(
    `${c.req.method} ${path} ${c.res.status} ${Date.now() - started}ms`
  );
  // Logging transport must not generate logs of itself (feedback loop).
  if (
    !path.includes("/logs") &&
    (c.res.status >= 400 ||
      (c.req.method !== "GET" &&
        (path.startsWith("/admin/") || path.startsWith("/approve/"))))
  ) {
    c.executionCtx.waitUntil(
      controlLog(
        c.env,
        "http",
        `${c.req.method} ${path} status=${c.res.status} duration_ms=${Date.now() - started}`,
        c.res.status >= 500 ? "error" : c.res.status >= 400 ? "warn" : "info"
      )
    );
  }
};
