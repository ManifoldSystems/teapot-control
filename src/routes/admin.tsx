import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { safeEqual } from "../helpers/crypto";
import {
  ALIAS_RE,
  displayName,
  getDevice,
  listDevices,
} from "../helpers/devices";
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
  safeNext,
} from "../middlewares/admin-auth";
import type { AppEnv } from "../types";
import { ApprovePage } from "../views/approve";
import { DashboardPage, DeviceRows } from "../views/dashboard";
import { DevicePage } from "../views/device";
import { LoginPage } from "../views/login";

const ACTIONS: Record<string, string> = {
  approve: "UPDATE devices SET status = 'approved' WHERE node_id = ?",
  revoke: "UPDATE devices SET status = 'pending' WHERE node_id = ?",
  exit: "UPDATE devices SET exit_enabled = 1 - exit_enabled WHERE node_id = ? AND can_exit = 1",
  delete: "DELETE FROM devices WHERE node_id = ?",
};

export const adminRoutes = new Hono<AppEnv>()
  .get("/login", (c) =>
    c.html(<LoginPage next={safeNext(c.req.query("next"))} />)
  )
  .post("/login", async (c) => {
    const form = await c.req.parseBody();
    const token = typeof form.token === "string" ? form.token : "";
    const next = safeNext(form.next);
    if (!c.env.ADMIN_TOKEN || !safeEqual(token, c.env.ADMIN_TOKEN)) {
      return c.html(<LoginPage error="Wrong token." next={next} />, 401);
    }
    setCookie(c, ADMIN_COOKIE, await adminCookieValue(c), {
      httpOnly: true,
      secure: true,
      // Lax, not Strict: the approve link is opened from a terminal, which
      // browsers may treat as cross-site. POSTs from other sites still get
      // no cookie.
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect(next);
  })
  .post("/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/" });
    return c.redirect("/login");
  })

  .use("/", adminAuth)
  .use("/admin/*", adminAuth)
  .use("/approve/*", adminAuth)
  .use("/devices/*", adminAuth)

  .get("/devices/:id", async (c) => {
    const id = c.req.param("id");
    if (!isNodeId(id)) return c.text("not found", 404);
    const [devices, online] = await Promise.all([
      listDevices(c.env.DB),
      fetchOnline(c.env),
    ]);
    const d = devices.find((x) => x.node_id === id);
    if (!d) return c.redirect("/");
    return c.html(
      <DevicePage
        d={d}
        live={online.find((o) => o.node_id === id)}
        names={new Map(devices.map((x) => [x.node_id, displayName(x)]))}
        error={c.req.query("error")}
      />
    );
  })

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

  // `teapot login` opens this page for its own node id.
  .get("/approve/:id", async (c) => {
    const id = c.req.param("id");
    if (!isNodeId(id)) return c.text("not found", 404);
    const device = await getDevice(c.env.DB, id);
    const state = !device
      ? "missing"
      : device.status === "approved"
        ? "already"
        : "confirm";
    return c.html(<ApprovePage nodeId={id} device={device} state={state} />);
  })
  .post("/approve/:id", async (c) => {
    const id = c.req.param("id");
    if (!isNodeId(id)) return c.text("not found", 404);
    const { meta } = await c.env.DB.prepare(ACTIONS.approve).bind(id).run();
    const device = await getDevice(c.env.DB, id);
    if (!meta.changes || !device) {
      return c.html(
        <ApprovePage nodeId={id} device={null} state="missing" />,
        404
      );
    }
    await broadcastPeersChanged(c.env);
    return c.html(<ApprovePage nodeId={id} device={device} state="added" />);
  })

  .get("/admin/sockets.json", async (c) =>
    presenceStub(c.env).fetch("https://presence/sockets")
  )

  // Before the generic action route: "alias" is not in ACTIONS.
  .post("/admin/devices/:id/alias", async (c) => {
    const id = c.req.param("id");
    if (!isNodeId(id)) return c.text("not found", 404);
    const form = await c.req.parseBody();
    const alias = typeof form.alias === "string" ? form.alias.trim() : "";
    const back = safeNext(form.back);
    const fail = (message: string, status: 400 | 409) =>
      back === "/"
        ? c.text(message, status)
        : c.redirect(
            `/devices/${id}?error=${encodeURIComponent(message)}#rename`
          );
    if (alias && !ALIAS_RE.test(alias)) {
      return fail(
        "Alias: letters, digits, dot, dash, underscore; up to 64 characters.",
        400
      );
    }
    if (alias) {
      const clash = (await listDevices(c.env.DB)).find(
        (d) =>
          d.node_id !== id &&
          [d.alias, d.name].some(
            (n) => n && n.toLowerCase() === alias.toLowerCase()
          )
      );
      if (clash) {
        return c.text(
          `"${alias}" is already used by ${displayName(clash)}.`,
          409
        );
      }
    }
    await c.env.DB.prepare("UPDATE devices SET alias = ? WHERE node_id = ?")
      .bind(alias || null, id)
      .run();
    await broadcastPeersChanged(c.env);
    return c.redirect(back);
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
    const form = await c.req
      .parseBody()
      .catch(() => ({}) as Record<string, unknown>);
    // Removed devices have no detail page to return to.
    return c.redirect(action === "delete" ? "/" : safeNext(form.back));
  });
