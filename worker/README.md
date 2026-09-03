# Hamvara Growth API

Cloudflare Worker for real PageSpeed/Lighthouse audits and secure OAuth connections.

## Local setup

The repository-root `wrangler.toml` is the only Worker configuration. Do not add a
second config inside `worker/`. The npm scripts explicitly use the root config so
the production D1 binding cannot be omitted because of the current directory.

1. Run `npm install` in `worker/`.
2. Confirm the production D1 binding in `../wrangler.toml`.
3. Apply schema: `npx wrangler d1 execute hamvara-growth-production --config ../wrangler.toml --file schema.sql --remote`.
4. Add secrets with `npx wrangler secret put NAME --config ../wrangler.toml`.
5. Run `npm run dev` or `npm run deploy`.

`npm run deploy` first verifies that the root config contains the `DB` binding for
`hamvara-growth-production`, then deploys with that exact config. The check blocks
deployment if the binding, database name, database ID, or Worker entry point is
missing or invalid.

After deployment, set `growth/config.js` `apiBase` to the Worker URL (later `https://api.hamvara.com`).

OAuth callback URLs follow this pattern:

`https://api.hamvara.com/api/oauth/{provider}/callback`

Providers: `google`, `meta`, `linkedin`, `wordpress`.

No OAuth token is sent to the browser. Tokens are encrypted with AES-GCM before being stored in D1.
