import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export const logger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now();
  await next();
  const path = new URL(c.req.url).pathname;
  console.log(
    `${c.req.method} ${path} ${c.res.status} ${Date.now() - started}ms`
  );
};
