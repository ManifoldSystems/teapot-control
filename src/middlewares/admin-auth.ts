import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { hmacHex } from "../helpers/crypto";
import { logsStub } from "../helpers/logs";
import type { AppEnv } from "../types";

export const ADMIN_COOKIE = "teapot_admin";

export const SESSION_SECONDS = 60 * 60 * 24 * 30;
const sessionKey = (c: Context<AppEnv>, cookie: string) =>
  hmacHex(
    c.env.CONTROL_SECRET as string,
    `session:${c.env.ADMIN_TOKEN}:${cookie}`
  );

export const createAdminSession = async (c: Context<AppEnv>) => {
  const cookie = crypto.randomUUID() + crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
    .bind(now)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)"
  )
    .bind(await sessionKey(c, cookie), now + SESSION_SECONDS)
    .run();
  return cookie;
};

export const deleteAdminSession = async (c: Context<AppEnv>) => {
  const cookie = getCookie(c, ADMIN_COOKIE);
  if (cookie) {
    const authenticated = await isAdmin(c);
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?")
      .bind(await sessionKey(c, cookie))
      .run();
    // Existing admin log sockets must not outlive logout. Other admin viewers
    // reconnect with their own still-valid sessions.
    if (authenticated)
      await logsStub(c.env).fetch("https://logs/kick", {
        method: "POST",
        body: "admin",
      });
  }
};

export const isAdmin = async (c: Context<AppEnv>) => {
  if (!c.env.ADMIN_TOKEN) return false;
  const cookie = getCookie(c, ADMIN_COOKIE);
  if (!cookie || !/^[a-f0-9-]{72}$/.test(cookie)) return false;
  const row = await c.env.DB.prepare(
    "SELECT expires_at FROM admin_sessions WHERE id = ?"
  )
    .bind(await sessionKey(c, cookie))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Math.floor(Date.now() / 1000);
};

/** Only same-origin paths, so `?next=` cannot bounce to another site. */
export const safeNext = (next: unknown) =>
  typeof next === "string" &&
  next.startsWith("/") &&
  !next.startsWith("//") &&
  !next.startsWith("/\\")
    ? next
    : "/";

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await isAdmin(c))) {
    const url = new URL(c.req.url);
    const back = url.pathname + url.search;
    return c.redirect(
      back === "/" ? "/login" : `/login?next=${encodeURIComponent(back)}`
    );
  }
  await next();
};
