# Hamvara Growth and MRP API

Cloudflare Worker for Growth integrations and the tenant-isolated Hamvara MRP SaaS.

## Local setup

The repository-root `wrangler.toml` is the only Worker configuration. Do not add a second config inside `worker/`. The npm scripts explicitly use the root config so the production D1 binding cannot be omitted because of the current directory.

1. Run `npm install` in `worker/`.
2. Confirm the production D1 binding in `../wrangler.toml`.
3. Apply the base schema with `npx wrangler d1 execute hamvara-growth-production --config ../wrangler.toml --file schema.sql --remote`.
4. Add secrets with `npx wrangler secret put NAME --config ../wrangler.toml`.
5. Run `npm run dev` for local development or `npm run deploy` for production.

`npm run dev` adds localhost origins only for the local Wrangler process. They are not stored in the production configuration.

`npm run deploy` is the only supported production path. It verifies the root config and production-only CORS allowlist, runs the test suite, applies all required MRP D1 migrations to `hamvara-growth-production`, and only then deploys the Worker with that exact config. If validation, tests, or any migration fails, the Worker is not deployed.

## MRP SaaS setup

Apply the MRP migrations without deploying only when you explicitly need a database-only operation:

`npm run migrate:production`

Create a separate Cloudflare secret named `MRP_ADMIN_TOKEN`, then provision the first company workspace:

`npm run mrp:provision -- https://api.hamvara.com ADMIN_TOKEN company-slug "Company Name" owner`

The command returns the workspace Access Key once. Store it securely and use it with the workspace slug and username at `https://hamvara.com/mrp/`.

The MRP API stores each company's state under a separate workspace ID, hashes user access keys, keeps an audit log and uses revision checks to prevent accidental overwrites from concurrent sessions.

## Growth integrations

After deployment, set `growth/config.js` `apiBase` to the Worker URL (later `https://api.hamvara.com`). OAuth callback URLs follow `https://api.hamvara.com/api/oauth/{provider}/callback`.

Providers: `google`, `meta`, `linkedin`, `wordpress`. No OAuth token is sent to the browser. Tokens are encrypted with AES-GCM before being stored in D1.
