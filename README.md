# Teapot Control

Control plane for [Teapot](https://github.com/ManifoldSystems/teapot): device
registry, approval, exit-node allowlist, presence, and a dashboard. Hono on
**Cloudflare Workers** with D1 and one Durable Object.

Proxy traffic never passes through here; devices talk to each other over iroh.
Wire format: [`teapot/docs/protocol.md`](https://github.com/ManifoldSystems/teapot/blob/main/docs/protocol.md).

Live: `https://teapot-control.sociopath-xyz.workers.dev`

## Pieces

| Binding                     | What                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `DB` (D1)                   | `devices`: node id, name, platform, pending/approved, exit flags, last IP, last seen         |
| `PRESENCE` (Durable Object) | one WebSocket per device; open socket = online. Hibernation API, `ping`→`pong` auto-response |
| `CONTROL_SECRET` (secret)   | HMAC for challenges, device JWTs, admin cookie. ≥ 32 chars                                   |
| `ADMIN_TOKEN` (secret)      | dashboard password                                                                           |

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
bun run deploy
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

Right after `wrangler deploy` the Durable Object can still run the previous
code for a few seconds; a smoke run straight after a deploy that changes
`presence.ts` may fail once and pass on the next run.

`scripts/smoke.ts` ends by using up this IP's login budget for a minute; set
`SKIP_RATE_LIMIT=1` to run it twice in a row.


Cloudflare's browser integrity check answers `403` / error `1010` to known
library user agents such as `Python-urllib`. Clients must send their own
`User-Agent`; the Rust agent should send `teapot/<version>`.
