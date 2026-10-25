import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { hmacHex, safeEqual } from "../helpers/crypto";
import type { AppEnv } from "../types";

export const ADMIN_COOKIE = "teapot_admin";

/** Cookie value is derived from ADMIN_TOKEN, so changing it logs everyone out. */
export const adminCookieValue = (c: Context<AppEnv>) =>
  hmacHex(c.env.CONTROL_SECRET as string, `admin:${c.env.ADMIN_TOKEN}`);

export const isAdmin = async (c: Context<AppEnv>) => {
  if (!c.env.ADMIN_TOKEN) return false;
  const cookie = getCookie(c, ADMIN_COOKIE);
  return !!cookie && safeEqual(cookie, await adminCookieValue(c));
};

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await isAdmin(c))) return c.redirect("/login");
  await next();
};
