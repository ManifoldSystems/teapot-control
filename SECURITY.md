# Security

Security fixes target the current `main` branch; there is no separate long-term
support line. Teapot Control is an experimental, single-tenant control plane.

Use **Security → Report a vulnerability** on GitHub when available. Otherwise,
open an issue titled **Private security contact requested**, without technical
details or credentials, so a maintainer can arrange a private channel.

Privately include the affected commit/version, reproduction steps, and impact.
Use a test deployment and redact tokens, device keys, addresses, and personal data.

Use independently generated `CONTROL_SECRET` and `ADMIN_TOKEN` values. Keep
`.dev.vars`, `.admin-token`, `.wrangler`, and deployment-specific config out of
Git. Changing `ADMIN_TOKEN` invalidates dashboard sessions; changing
`CONTROL_SECRET` also invalidates device tokens.

Device approval grants access to mesh metadata and diagnostic logs. Enabling
an exit requires current authorization: updated clients clear their allowlist
when a refresh fails. Dashboard sessions expire server-side after 30 days;
logout revokes the current session. Apply migration `0005_admin_sessions.sql`
before deploying the session upgrade; existing dashboard cookies require login
again. Browser mutations are restricted to the same origin.

Device approval grants access to mesh metadata and diagnostic logs. Enabling
an exit is a separate admin decision. See the [agent security policy](https://github.com/ManifoldSystems/teapot/blob/main/SECURITY.md)
for proxy and LAN-access boundaries.
