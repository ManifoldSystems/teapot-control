// A fresh presence object avoids old code surviving deploy on busy sockets.
export {};

const base = process.env.BASE?.trim().replace(/\/$/, "");
if (!base)
  throw new Error("Set BASE to your control plane URL before deploying");
const url = new URL(base);
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error(
    "BASE must be an http(s) URL without credentials, query or fragment"
  );
const token = (
  process.env.ADMIN_TOKEN ?? (await Bun.file(".admin-token").text())
).trim();
const authenticate = async () => {
  const login = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "user-agent": "teapot-deploy/1" },
    body: new URLSearchParams({ token }),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (login.status !== 302 || !cookie) throw new Error("Admin login failed");
  return cookie;
};
let cookie = await authenticate();
const admin = (path: string, method = "GET") =>
  fetch(`${base}${path}`, {
    method,
    headers: { cookie, "user-agent": "teapot-deploy/1" },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
type State = { generation: string; remaining: number; control_version: string };
const before = await admin("/admin/presence.json");
let previous: string;
const retireOnly = process.argv.includes("--retire-only");
if (before.status === 404) {
  if (retireOnly)
    throw new Error("This deployment does not support retirement yet");
  const legacy = await admin("/admin/sockets.json");
  if (!legacy.ok || !Array.isArray(await legacy.json()))
    throw new Error("Cannot verify legacy presence");
  previous = "global";
} else {
  if (!before.ok)
    throw new Error(`Presence preflight failed: ${before.status}`);
  const state = (await before.json()) as State;
  if (state.remaining && !retireOnly)
    throw new Error(
      "Retire previous presence via POST /admin/presence/retire before deploying again"
    );
  previous = state.generation;
}
const generation = retireOnly ? previous : `deploy-${crypto.randomUUID()}`;
if (!retireOnly) {
  const deploy = Bun.spawn(
    [
      "bunx",
      "wrangler",
      ...(process.env.WRANGLER_CONFIG
        ? ["--config", process.env.WRANGLER_CONFIG]
        : []),
      "deploy",
      "--minify",
      "--var",
      `PRESENCE_GENERATION:${generation}`,
      "--var",
      `PREVIOUS_PRESENCE_GENERATION:${previous}`,
    ],
    { stdout: "inherit", stderr: "inherit" }
  );
  if ((await deploy.exited) !== 0)
    throw new Error(
      "Worker deploy failed; previous presence has not been retired"
    );
  // Auth upgrades may invalidate the pre-deployment session.
  cookie = await authenticate();
  // Wait for the new Worker to be routed before retiring any sockets.
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await admin("/admin/presence.json");
    if (res.status === 302 || res.status === 401) cookie = await authenticate();
    if (res.ok && ((await res.json()) as State).generation === generation)
      break;
    if (attempt === 29)
      throw new Error("New generation not routed; retirement pending");
    await Bun.sleep(2000);
  }
}
let quiet = 0;
for (let attempt = 0; attempt < 15; attempt++) {
  const res = await admin("/admin/presence/retire", "POST");
  if (!res.ok)
    throw new Error(
      `Retirement failed (${res.status}); retry POST /admin/presence/retire`
    );
  const state = (await res.json()) as State;
  if (state.generation !== generation)
    throw new Error("Concurrent deploy detected; check presence generations");
  quiet = state.remaining ? 0 : quiet + 1;
  if (quiet >= 3) {
    await admin("/logout", "POST");
    console.log(
      `Previous presence retired; active ${generation} (${state.control_version})`
    );
    process.exit(0);
  }
  await Bun.sleep(2000);
}
throw new Error(
  "Previous sockets still closing; retry POST /admin/presence/retire"
);
