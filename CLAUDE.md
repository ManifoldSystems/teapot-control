# teapot-control

Control plane for [teapot](https://github.com/ManifoldSystems/teapot): device
registry, approval, exit allowlist, presence, dashboard. Hono on Cloudflare
Workers with D1 and one Durable Object. Live at **`https://teapot.fannn.tech`**
(custom domain; workers.dev and preview URLs are off). Proxy traffic never
passes through here.

Started from `Omniflow-id/Omniflow-Hono-Starter` (routes / middlewares /
helpers layout, Biome, bun). Wire format: `teapot/docs/protocol.md` in the
agent repo — change it there first. History: second-brain `Teapot/`.

## Layout

```
src/index.ts              exports app + Presence
src/app.ts                logger → /health → requireConfigured → rate limits → routes
src/routes/auth.ts        POST /v1/auth/challenge, /v1/auth/verify (Ed25519 over HMAC challenge)
src/routes/devices.ts     /v1/devices/me, /v1/peers, /v1/exit/allowlist, /v1/presence (WS)
src/routes/admin.tsx      /login, /, /devices/:id, /approve/:id, /admin/devices/:id/:action,
                          /admin/sockets.json (debug: every presence socket)
src/presence.ts           Durable Object "global": one hibernating WS per device,
                          attachment = paths, traffic, ips; broadcasts peers_changed
src/views/*.tsx           dashboard (⋯ row menu), device (/devices/:id: details, alias), login, approve
src/middlewares/          device-auth (JWT aud=device), admin-auth (cookie, ?next=),
                          rate-limit (LOGIN_LIMITER 10/min, AUTH_LIMITER 60/min)
migrations/               D1: 0001 devices, 0002 public_ipv4/public_ipv6, 0003 alias/model
scripts/smoke.ts          end-to-end against a deployment
```

## Commands

```bash
bun install
bun run dev                      # wrangler dev on :8787, uses .dev.vars
bun run typecheck && bun test    # tsc + challenge/Ed25519 unit tests
bunx biome check --write .
bun run migrate:local | migrate:remote
bun run deploy
SKIP_RATE_LIMIT=1 ADMIN_TOKEN=$(cat .admin-token) BASE=https://teapot.fannn.tech bun scripts/smoke.ts
```

`.dev.vars` (local) and `.admin-token` (production dashboard password) are
gitignored. Never print the token. Secrets in production: `CONTROL_SECRET`,
`ADMIN_TOKEN` (`bunx wrangler secret put …`).

## Model

- Device = iroh endpoint id (hex Ed25519 public key). First login → `pending`;
  owner approves at `/approve/<id>` (what `teapot login` opens) or the dashboard.
- `can_exit` = device offers exit now; `exit_enabled` = owner's toggle, stored
  separately so restarts never clear it. Peer `exit` = both.
- `alias` (set in the dashboard, unique, `[A-Za-z0-9._-]`) wins over the
  device-reported `name` in /v1/peers and the dashboard; `model` comes from the
  device (e.g. "OPPO CPH2687").
- Online = an open presence socket. Connect/close broadcasts `peers_changed`.
- `last_ip` = address Cloudflare saw (one family); `public_ipv4/ipv6` = what the
  agent reports from its iroh addresses.

## Deploying

1. `migrate:remote` **before** deploy when there is a new migration, and check
   it applied (`wrangler d1 execute … pragma_table_info`). It has failed once
   transiently — rerun.
2. `bun run deploy`.
3. **If `presence.ts` changed: the Durable Object keeps running the old code
   while devices keep sockets busy.** Seen across three deploys. Detect:
   `GET /admin/sockets.json` returns `404` text `not found` from the old object,
   or attachments lack new fields. Fix: stop every agent ~80 s, then start them.
4. Smoke test the live URL. It ends by using up this IP's login budget for a
   minute unless `SKIP_RATE_LIMIT=1`.

Custom domain: `routes: [{ pattern, custom_domain: true }]`. Adding it turns
workers.dev off unless `workers_dev` is set — keep it on until every agent
points at the new URL, then turn it off.

## Conventions

- Biome formatting, double quotes, 2 spaces. `jsonOk` / `jsonError` envelopes.
- D1 writes from the DO only on change (status arrives every 5 s).
- Admin cookie is `SameSite=Lax` on purpose (approve links open from terminals).
- Cloudflare blocks library user agents (error 1010); clients set their own.
