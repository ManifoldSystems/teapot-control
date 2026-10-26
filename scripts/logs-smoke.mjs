// Local workerd integration: npm/node runtime, no deployment or real credentials.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const temp = await mkdtemp(join(tmpdir(), "teapot-logs-"));
let mf;
const sockets = [];
const secret = "local-log-test-secret-not-production";
const admin = "local-log-test-admin";
const a = "a".repeat(64),
  b = "b".repeat(64),
  pending = "c".repeat(64);
function token(node) {
  const head = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      aud: "device",
      sub: node,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}
const cookie = `teapot_admin=${createHmac("sha256", secret).update(`admin:${admin}`).digest("hex")}`;
async function request(path, node = b, init = {}) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    redirect: "manual",
    ...init,
    headers: { authorization: `Bearer ${token(node)}`, ...init.headers },
  });
}
async function publish(entries) {
  const res = await request("/v1/logs", a, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
}
function viewer(ws) {
  sockets.push(ws);
  const queue = [],
    waiting = [];
  ws.addEventListener("message", (event) => {
    const value = event.data === "pong" ? "pong" : JSON.parse(event.data);
    if (waiting.length) waiting.shift()(value);
    else queue.push(value);
  });
  ws.accept();
  return () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("log frame timeout")),
            5000
          );
          waiting.push((value) => {
            clearTimeout(timer);
            resolve(value);
          });
        });
}
try {
  await build({
    entryPoints: ["src/index.ts"],
    outfile: join(temp, "worker.mjs"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["cloudflare:workers"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          script: await readFile(join(temp, "worker.mjs"), "utf8"),
          compatibilityDate: "2026-09-13",
          bindings: {
            CONTROL_SECRET: secret,
            ADMIN_TOKEN: admin,
            PRESENCE_GENERATION: "test-new",
            PREVIOUS_PRESENCE_GENERATION: "global",
            WORKER_VERSION: { id: "test-version" },
          },
          d1Databases: ["DB"],
          durableObjects: {
            PRESENCE: { className: "Presence", useSQLite: true },
            LOGS: { className: "Logs", useSQLite: true },
          },
        },
      ],
    })
  );
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`migrations/${file}`, "utf8");
    for (const statement of sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  }
  for (const node of [a, b, pending])
    await db
      .prepare("INSERT INTO devices (node_id,status) VALUES (?,?)")
      .bind(node, node === pending ? "pending" : "approved")
      .run();
  assert.equal(
    (await mf.dispatchFetch("http://localhost/v1/logs")).status,
    401
  );
  assert.equal((await request("/v1/logs", pending)).status, 403);
  assert.equal(
    (
      await request("/v1/logs/stream", pending, {
        headers: { upgrade: "websocket" },
      })
    ).status,
    403
  );
  assert.equal((await request("/v1/logs?after=-1")).status, 400);
  // Keep an old-generation socket busy while the current generation connects.
  const namespace = await mf.getDurableObjectNamespace("PRESENCE");
  const old = namespace.get(namespace.idFromName("global"));
  const legacy = await old.fetch("https://presence/connect", {
    headers: { upgrade: "websocket", "x-teapot-node": a },
  });
  const legacyNext = viewer(legacy.webSocket);
  legacy.webSocket.send("ping");
  while ((await legacyNext()) !== "pong") {
    /* Drain connect frames. */
  }
  assert.equal(
    (
      await request("/v1/presence", a, {
        headers: { upgrade: "websocket", "x-teapot-version": "bad version" },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await request("/v1/presence", a, {
        headers: { upgrade: "websocket", "x-teapot-protocol": "2" },
      })
    ).status,
    426
  );
  const current = await request("/v1/presence", b, {
    headers: {
      upgrade: "websocket",
      "x-teapot-version": "0.2.0",
      "x-teapot-protocol": "1",
    },
  });
  assert.equal(current.status, 101);
  const currentNext = viewer(current.webSocket);
  let hello;
  do {
    hello = await currentNext();
  } while (hello.type !== "hello");
  assert.equal(hello.control_version, "test-version");
  assert.equal(hello.presence_generation, "test-new");
  const me = await (await request("/v1/devices/me", b)).json();
  assert.equal(me.data.agent_version, "0.2.0");
  assert.equal(me.data.agent_protocol, 1);
  const dashboard = await request("/", a, { headers: { cookie } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /0\.2\.0/);
  await request("/v1/devices/me", b, {
    method: "PUT",
    body: JSON.stringify({ name: "versioned-agent" }),
  });
  assert.equal(
    (await (await request("/v1/devices/me", b)).json()).data.agent_version,
    "0.2.0"
  );
  assert.equal(
    (await request("/admin/presence/retire", a, { method: "POST" })).status,
    302
  );
  const state = await (
    await request("/admin/presence.json", a, { headers: { cookie } })
  ).json();
  assert.equal(state.remaining, 1);
  const legacyClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("legacy socket not retired")),
      5000
    );
    legacy.webSocket.addEventListener("close", (e) => {
      clearTimeout(timeout);
      resolve(e.code);
    });
  });
  const retired = await request("/admin/presence/retire", a, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(retired.status, 200);
  assert.equal(await legacyClosed, 4001);
  assert.equal((await retired.json()).remaining, 0);
  assert.equal(
    (
      await request("/admin/presence/retire", a, {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    200
  );
  current.webSocket.send("ping");
  while ((await currentNext()) !== "pong") {
    /* Current socket survives retirement. */
  }
  const downgrade = await request("/v1/presence", b, {
    headers: { upgrade: "websocket" },
  });
  assert.equal(downgrade.status, 101);
  viewer(downgrade.webSocket);
  const legacyMe = await (await request("/v1/devices/me", b)).json();
  assert.equal(legacyMe.data.agent_version, null);
  assert.equal(legacyMe.data.agent_protocol, null);
  // Legacy client reconnects on the normal route, without version headers.
  const reconnected = await request("/v1/presence", a, {
    headers: { upgrade: "websocket" },
  });
  assert.equal(reconnected.status, 101);
  viewer(reconnected.webSocket);
  assert.equal(
    (await (await request("/v1/devices/me", a)).json()).data.agent_version,
    null
  );
  console.log(
    "✓ presence generation retirement, legacy reconnect, version handshake, auth and validation"
  );
  const initial = await request(`/v1/logs/stream?device=${a}`, b, {
    headers: { upgrade: "websocket" },
  });
  assert.equal(initial.status, 101);
  const next = viewer(initial.webSocket);
  assert.equal((await next()).entries.length, 0);
  initial.webSocket.send("ping");
  assert.equal(await next(), "pong");
  const e = {
    id: "test-1",
    timestamp: Date.now(),
    level: "info",
    source: "test",
    message: "hello from A",
    node_id: b,
  };
  await publish([e]);
  const live = (await next()).entries;
  assert.equal(live[0].node_id, a);
  await publish([e]);
  const history = await (await request(`/v1/logs?device=${a}`)).json();
  assert.equal(history.data.entries.length, 1);
  assert.equal(
    (await (await request(`/v1/logs?device=${a}&level=error`)).json()).data
      .entries.length,
    0
  );
  await publish([{ ...e, id: "test-2", level: "error" }]);
  await next();
  const replay = await request(
    `/v1/logs/stream?device=${a}&after=${live[0].cursor}`,
    b,
    { headers: { upgrade: "websocket" } }
  );
  const replayNext = viewer(replay.webSocket);
  assert.equal((await replayNext()).entries[0].id, "test-2");
  const adminView = await mf.dispatchFetch(
    "http://localhost/admin/logs/stream",
    { headers: { cookie, upgrade: "websocket" } }
  );
  assert.equal(adminView.status, 101);
  const adminNext = viewer(adminView.webSocket);
  assert.ok((await adminNext()).entries.length >= 2);
  // A reconnect must replay more than one history page, in monotonic order.
  for (let batch = 0; batch < 5; batch++) {
    await publish(
      Array.from({ length: 50 }, (_, i) => ({
        ...e,
        id: `bulk-${batch * 50 + i}`,
      }))
    );
  }
  const catchup = await request(
    `/v1/logs/stream?device=${a}&after=${live[0].cursor}`,
    b,
    { headers: { upgrade: "websocket" } }
  );
  const catchupNext = viewer(catchup.webSocket);
  const caught = [];
  while (caught.length < 251) caught.push(...(await catchupNext()).entries);
  assert.equal(caught.length, 251);
  assert.equal(new Set(caught.map((e) => e.cursor)).size, 251);
  assert.ok(caught.every((e, i) => i === 0 || e.cursor > caught[i - 1].cursor));
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("revocation did not close viewer")),
      5000
    );
    initial.webSocket.addEventListener("close", (event) => {
      clearTimeout(timer);
      resolve(event.code);
    });
  });
  const revoke = await mf.dispatchFetch(
    `http://localhost/admin/devices/${b}/revoke`,
    { method: "POST", headers: { cookie }, redirect: "manual" }
  );
  assert.equal(revoke.status, 302);
  assert.equal(await closed, 4001);
  assert.equal((await request("/v1/logs")).status, 403);
  assert.equal(
    (await request("/v1/logs/stream", b, { headers: { upgrade: "websocket" } }))
      .status,
    403
  );
  console.log(
    "Log integration passed: auth, cross-device fan-out, ping, deduplication, filtering, cursor replay, admin viewer, revocation."
  );
} finally {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      /* closed by revocation */
    }
  }
  await mf?.dispose();
  await rm(temp, { recursive: true, force: true });
}
