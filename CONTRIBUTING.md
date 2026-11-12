# Contributing

Use Bun 1.4.2 and Node.js 22 or newer:

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run test:logs
```

The logs integration test runs local workerd with generated test credentials.
It does not require a Cloudflare account. `scripts/smoke.ts` is different: it
changes data on the deployment selected by `BASE`, so use your own test instance.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in your
own values. Keep production config in gitignored `wrangler.local.jsonc` and
follow the README's deployment instructions.

Keep pull requests focused and explain your verification. Wire changes begin
in `ManifoldSystems/teapot/docs/protocol.md`; coordinate client changes as needed.
Add a D1 migration for schema changes. Queries in the log store must use indexes.
Never include real credentials, account IDs, fleet details, or logs in examples.

Contributions use MIT; retain third-party notices when reusing code.
For vulnerabilities, see [SECURITY.md](SECURITY.md).
