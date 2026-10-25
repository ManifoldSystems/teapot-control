/**
 * End-to-end check against a running control plane:
 *   BASE=http://localhost:8787 ADMIN_TOKEN=... bun scripts/smoke.ts
 * Creates two throwaway devices, walks auth → approval → peers → allowlist →
 * presence, then removes them.
 */
import { generateKeyPairSync, sign } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:8787";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) throw new Error("set ADMIN_TOKEN");

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const makeDevice = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return {
    nodeId: hex(der.subarray(der.length - 32)),
    sign: (msg: string) => hex(sign(null, Buffer.from(msg), privateKey)),
    token: "",
  };
};

const api = async (
  path: string,
  init: RequestInit & { token?: string } = {}
) => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body as any };
};

const login = async (d: ReturnType<typeof makeDevice>, tamper = false) => {
  const ch = await api("/v1/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ node_id: d.nodeId }),
  });
  const challenge: string = ch.body.data.challenge;
  const signature = d.sign(tamper ? `${challenge}x` : challenge);
  return api("/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify({ node_id: d.nodeId, challenge, signature }),
  });
};

const health = await api("/health");
check("health ok", health.body?.status === "ok", health.body);

const a = makeDevice();
const b = makeDevice();

const bad = await login(a, true);
check("bad signature rejected", bad.status === 401, bad.body);

for (const d of [a, b]) {
  const res = await login(d);
  d.token = res.body?.data?.token;
  check(
    `login ${d.nodeId.slice(0, 8)} → pending`,
    res.body?.data?.status === "pending",
    res.body
  );
}

await api("/v1/devices/me", {
  method: "PUT",
  token: a.token,
  body: JSON.stringify({
    name: "smoke-laptop",
    platform: "macos",
    can_exit: false,
  }),
});
const putB = await api("/v1/devices/me", {
  method: "PUT",
  token: b.token,
  body: JSON.stringify({
    name: "smoke-raspi",
    platform: "linux",
    can_exit: true,
  }),
});
check("PUT /v1/devices/me", putB.body?.data?.can_exit === true, putB.body);

const pending = await api("/v1/peers", { token: a.token });
check("pending device gets no peers", pending.status === 403, pending.body);

// Admin session
const loginRes = await fetch(`${BASE}/login`, {
  method: "POST",
  body: new URLSearchParams({ token: ADMIN_TOKEN }),
  redirect: "manual",
});
const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
check(
  "admin login",
  loginRes.status === 302 && cookie.startsWith("teapot_admin="),
  loginRes.status
);
const wrong = await fetch(`${BASE}/login`, {
  method: "POST",
  body: new URLSearchParams({ token: "nope" }),
  redirect: "manual",
});
check("wrong admin token rejected", wrong.status === 401, wrong.status);
const anon = await fetch(`${BASE}/`, { redirect: "manual" });
check("dashboard needs login", anon.status === 302, anon.status);

const admin = (path: string) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
// `teapot login` flow: approve page → login with next → confirm.
const approvePath = `/approve/${a.nodeId}`;
const gated = await fetch(`${BASE}${approvePath}`, { redirect: "manual" });
check(
  "approve page sends anonymous users to login with next",
  gated.status === 302 &&
    gated.headers.get("location") ===
      `/login?next=${encodeURIComponent(approvePath)}`,
  gated.headers.get("location")
);
const nextLogin = await fetch(`${BASE}/login`, {
  method: "POST",
  body: new URLSearchParams({ token: ADMIN_TOKEN, next: approvePath }),
  redirect: "manual",
});
check(
  "login returns to next",
  nextLogin.headers.get("location") === approvePath,
  nextLogin.headers.get("location")
);
const evil = await fetch(`${BASE}/login`, {
  method: "POST",
  body: new URLSearchParams({ token: ADMIN_TOKEN, next: "//evil.example" }),
  redirect: "manual",
});
check(
  "login ignores off-site next",
  evil.headers.get("location") === "/",
  evil.headers.get("location")
);
const confirm = await (
  await fetch(`${BASE}${approvePath}`, { headers: { cookie } })
).text();
check(
  "approve page asks to confirm",
  confirm.includes("Add this device") && confirm.includes("smoke-laptop"),
  confirm.slice(0, 200)
);
const added = await (
  await fetch(`${BASE}${approvePath}`, { method: "POST", headers: { cookie } })
).text();
check(
  "approve page adds device",
  added.includes("was added"),
  added.slice(0, 200)
);

await admin(`/admin/devices/${b.nodeId}/approve`);
await admin(`/admin/devices/${b.nodeId}/exit`);

const peers = await api("/v1/peers", { token: a.token });
const peerB = peers.body?.data?.find((p: any) => p.node_id === b.nodeId);
check("approved device sees exit peer", peerB?.exit === true, peers.body);

const allow = await api("/v1/exit/allowlist", { token: b.token });
check(
  "exit allowlist contains client",
  allow.body?.data?.exit_enabled === true &&
    allow.body.data.allow.includes(a.nodeId),
  allow.body
);

// Presence
const wsUrl = `${BASE.replace(/^http/, "ws")}/v1/presence?token=${a.token}`;
const ws = new WebSocket(wsUrl);
const messages: string[] = [];
ws.onmessage = (e) => messages.push(String(e.data));
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = (e) => reject(e);
});
ws.send(
  JSON.stringify({
    type: "status",
    paths: [{ peer: b.nodeId, kind: "direct", rtt_ms: 23 }],
    traffic: [{ peer: b.nodeId, tx: 2048, rx: 3 * 1024 * 1024 }],
    ips: { v4: "203.0.113.7", v6: "2001:db8::7" },
  })
);
ws.send("ping");
await sleep(800);
check("ping auto-response", messages.includes("pong"), messages);

const online = await api("/v1/peers", { token: b.token });
const peerA = online.body?.data?.find((p: any) => p.node_id === a.nodeId);
check("presence: device online", peerA?.online === true, online.body);

const rows = await (
  await fetch(`${BASE}/?partial=rows`, { headers: { cookie } })
).text();
check(
  "dashboard shows path",
  rows.includes("smoke-raspi: direct 23ms"),
  rows.slice(0, 200)
);
check(
  "dashboard shows reported IPv4 and IPv6",
  rows.includes("203.0.113.7") && rows.includes("2001:db8::7"),
  rows.slice(rows.indexOf("smoke-laptop"), rows.indexOf("smoke-laptop") + 1500)
);
check(
  "dashboard shows traffic",
  rows.includes("↑2.0 KB ↓3.0 MB"),
  rows.slice(rows.indexOf("smoke-laptop"), rows.indexOf("smoke-laptop") + 1500)
);

await admin(`/admin/devices/${a.nodeId}/approve`); // triggers a broadcast
await sleep(500);
check(
  "peers_changed broadcast",
  messages.some((m) => m.includes("peers_changed")),
  messages
);

ws.close();
await sleep(1500);
const after = await api("/v1/peers", { token: b.token });
const peerA2 = after.body?.data?.find((p: any) => p.node_id === a.nodeId);
check("presence: offline after close", peerA2?.online === false, after.body);

for (const d of [a, b]) await admin(`/admin/devices/${d.nodeId}/delete`);
const gone = await api("/v1/devices/me", { token: a.token });
check("removed device loses access", gone.status === 401, gone.body);

// Last on purpose: uses up this IP's login budget for a minute.
if (process.env.SKIP_RATE_LIMIT !== "1") {
  let limited = false;
  for (let i = 0; i < 15 && !limited; i++) {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: new URLSearchParams({ token: "wrong" }),
      redirect: "manual",
    });
    limited = res.status === 429;
  }
  check("login is rate limited", limited);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
