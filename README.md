# Teapot Control

Control plane for [Teapot](https://github.com/ManifoldSystems/teapot): device
registry, approval, exit-node allowlist, presence, and a dashboard. Hono on
**Cloudflare Workers** with D1 and separate Presence / Logs Durable Objects.

Proxy traffic never passes through here; devices talk to each other over iroh.
Wire format: [`teapot/docs/protocol.md`](https://github.com/ManifoldSystems/teapot/blob/main/docs/protocol.md).

Live: `https://teapot.example.com` (custom domain; the workers.dev URL is off)

## Pieces

| Binding                          | What                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `DB` (D1)                        | `devices`: node id, name, platform, pending/approved, exit flags, last IP, last seen         |
| `PRESENCE` (Durable Object)      | one WebSocket per device; open socket = online. Hibernation API, `ping`→`pong` auto-response |
| `CONTROL_SECRET` (secret)        | HMAC for challenges, device JWTs, admin cookie. ≥ 32 chars                                   |
| `ADMIN_TOKEN` (secret)           | dashboard password                                                                           |
| `LOGIN_LIMITER` / `AUTH_LIMITER` | per-IP rate limits: `POST /login` 10/min, `/v1/auth/*` 60/min                                |

## Mesh logs

Open **Mesh logs** (`/admin/logs`) for live logs from all devices and control,
or use the link on a device detail page. Filter by device, minimum level, or
message; pause/resume and copy the visible history. Approved binary and Flutter
devices can also view each other's logs using their existing device identity.

`LOGS` is a SQLite-backed Durable Object with bounded history (10,000 entries
globally, at most seven days), deduplicated upload batches, cursor replay, and
hibernating viewer sockets independent of presence. Sources keep local logs
and upload every five seconds. Control adds admin actions, request failures,
and presence connect/disconnect events. The shared API is specified in
`teapot/docs/protocol.md`.

Checks: `bun run typecheck`, `bun test`, and `bun run test:logs` (local workerd
integration: auth, cross-device live delivery, deduplication, replay, filters,
admin viewing, and revocation). The integration script uses Wrangler's local
Miniflare/esbuild dependencies and never contacts production.

The `LOGS` binding and `v2-logs` Durable Object migration retain history across
deployments. Version reporting requires D1 migration `0004_agent_version.sql`.
Apply migrations and deploy control before updating agents.

## Versions and presence deploys

Rust 0.2.0 and Android 1.1.0+2 report their application version and presence
protocol on connect. Dashboard rows/details show this metadata even offline;
legacy agents are marked version unknown. This is self-reported metadata,
not artifact verification or a comparison against a release registry.

`bun run deploy` authenticates using `.admin-token` (or `ADMIN_TOKEN`), discovers
the active generation, deploys with a fresh `PRESENCE_GENERATION`, and retires
previous sockets via their existing `/kick` API. Old Android clients reconnect
without an app update. There is a brief presence interruption; the agents'
iroh endpoints remain running. Do not run deploys concurrently or use gradual
deployments. `BASE` overrides the control URL.

Check `/admin/presence.json`: active Worker version, generation, previous
generation, and `remaining` open old sockets. Retry a failed retirement with
`bun scripts/deploy.ts --retire-only`; do this before another deploy.
For rollback, deploy the desired source through this script with a new
generation rather than routing back to a retired Worker version.

## Device auth

No passwords. The node id is the device's Ed25519 public key, so signing our
challenge proves the caller holds the iroh secret key.

```
POST /v1/auth/challenge {node_id}                     → {challenge, expires_at}   (60 s, stateless, HMAC'd)
POST /v1/auth/verify    {node_id, challenge, signature} → {token, expires_at, status}
```

`signature` is hex Ed25519 over the UTF-8 challenge string. The token is an
HS256 JWT (`aud: device`, 24 h). First login creates the device as `pending`.

## Device API (Bearer token)

| Method | Path                 | Notes                                                                                                                                          |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/devices/me`     | own row                                                                                                                                        |
| PUT    | `/v1/devices/me`     | `{name?, platform?, can_exit?}`; omitted fields are kept; `can_exit` is what the device offers now, the owner's exit toggle is kept separately |
| GET    | `/v1/peers`          | approved only; other approved devices with `online`, `exit`                                                                                    |
| GET    | `/v1/exit/allowlist` | approved only; `{exit_enabled, allow: [node_id]}`                                                                                              |
| GET    | `/v1/presence`       | WebSocket; token as Bearer or `?token=`                                                                                                        |

Presence socket: send `ping` (answered `pong` without waking the object) and
`{"type":"status","paths":[{"peer","kind":"direct|relay","rtt_ms"}]}`. The
server sends `{"type":"peers_changed"}` when approval, exit settings, or any
device's online state change,
and closes with `4000` (replaced by a newer connection) or `4001` (removed or
revoked).

## Dashboard

`/` behind `/login` (`ADMIN_TOKEN`, HttpOnly SameSite=Lax cookie, 30 days).
Approve / revoke / remove devices, toggle exit, see presence, last public IP,
and per peer the path (direct/relay, RTT) and tunnel bytes each device
reports since its agent started. Refreshes every 5 s.

`/approve/<node_id>` is the page `teapot login` opens: it shows the device and
asks to add it. Signed-out visitors go to `/login?next=…` and come back after
signing in (`next` must be a same-origin path). The cookie is `SameSite=Lax`
so the link works when opened from a terminal; POSTs from other sites still
carry no cookie.

Planned: put Cloudflare Access in front and drop the password.

## Setup

```bash
bun install
cp .dev.vars.example .dev.vars        # fill both values
bun run migrate:local
bun run dev
```

Deploy (first time):

```bash
bunx wrangler d1 create teapot-control   # put the id in wrangler.jsonc
bun run migrate:remote
bunx wrangler deploy --minify             # bootstrap only, before admin login exists
openssl rand -hex 32 | tr -d '\n' | bunx wrangler secret put CONTROL_SECRET
bunx wrangler secret put ADMIN_TOKEN
```

Changing `ADMIN_TOKEN` signs out every dashboard session. Changing
`CONTROL_SECRET` also invalidates every device token; devices log in again.

## Checks

| Command                                     | What                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun test`                                  | challenge, Ed25519, hex helpers                                                              |
| `bun run typecheck`                         | `tsc --noEmit`                                                                               |
| `bun run format`                            | Biome                                                                                        |
| `BASE=… ADMIN_TOKEN=… bun scripts/smoke.ts` | end to end against a running deployment: auth, approval, peers, allowlist, presence, cleanup |

## Gotchas

**The Durable Object can keep running old code after a deploy.** While devices
keep their presence sockets busy, the `Presence` instance is not replaced: the
Worker serves the new version but `presence.ts` changes do not take effect.
Seen on 2026-10-25 across three deploys, hours apart. Check with
`GET /admin/sockets.json` (admin only; a 404 `not found` means the old object
is still answering). Fix: stop every agent for about a minute
(`launchctl bootout …` / `systemctl --user stop teapot`), then start them
again; the next request runs the new code. The generation-based deploy script
above replaces that manual procedure; verify it on the fleet during rollout.

`/admin/sockets.json` lists every presence socket with its ready state and
attachment (paths, traffic) — the quickest way to see what the dashboard is
built from.

Moving the Worker to a custom domain turns the workers.dev URL off unless
`workers_dev` is set; keep it on until every agent points at the new URL.

`scripts/smoke.ts` ends by using up this IP's login budget for a minute; set
`SKIP_RATE_LIMIT=1` to run it twice in a row.


Cloudflare's browser integrity check answers `403` / error `1010` to known
library user agents such as `Python-urllib`. Clients must send their own
`User-Agent`; the Rust agent should send `teapot/<version>`.
