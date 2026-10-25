import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { safeEqual } from "../helpers/crypto";
import { listDevices } from "../helpers/devices";
import { isNodeId } from "../helpers/hex";
import {
  broadcastPeersChanged,
  fetchOnline,
  presenceStub,
} from "../helpers/presence";
import {
  ADMIN_COOKIE,
  adminAuth,
  adminCookieValue,
} from "../middlewares/admin-auth";
import type { AppEnv } from "../types";
import { DashboardPage, DeviceRows } from "../views/dashboard";
import { LoginPage } from "../views/login";

const ACTIONS: Record<string, string> = {
  approve: "UPDATE devices SET status = 'approved' WHERE node_id = ?",
  revoke: "UPDATE devices SET status = 'pending' WHERE node_id = ?",
  exit: "UPDATE devices SET exit_enabled = 1 - exit_enabled WHERE node_id = ? AND can_exit = 1",
  delete: "DELETE FROM devices WHERE node_id = ?",
};

export const adminRoutes = new Hono<AppEnv>()
  .get("/login", (c) => c.html(<LoginPage />))
  .post("/login", async (c) => {
    const form = await c.req.parseBody();
    const token = typeof form.token === "string" ? form.token : "";
    if (!c.env.ADMIN_TOKEN || !safeEqual(token, c.env.ADMIN_TOKEN)) {
      return c.html(<LoginPage error="Wrong token." />, 401);
    }
    setCookie(c, ADMIN_COOKIE, await adminCookieValue(c), {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect("/");
  })
  .post("/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/" });
    return c.redirect("/login");
  })

  .use("/", adminAuth)
  .use("/admin/*", adminAuth)

  .get("/", async (c) => {
    const [devices, online] = await Promise.all([
      listDevices(c.env.DB),
      fetchOnline(c.env),
    ]);
    if (c.req.query("partial") === "rows") {
      return c.html(<DeviceRows devices={devices} online={online} />);
    }
    return c.html(<DashboardPage devices={devices} online={online} />);
  })

  .post("/admin/devices/:id/:action", async (c) => {
    const { id, action } = c.req.param();
    const sql = ACTIONS[action];
    if (!isNodeId(id) || !sql) return c.text("not found", 404);
    await c.env.DB.prepare(sql).bind(id).run();
    if (action === "delete" || action === "revoke") {
      await presenceStub(c.env).fetch("https://presence/kick", {
        method: "POST",
        body: id,
      });
    }
    await broadcastPeersChanged(c.env);
    return c.redirect("/");
  });
