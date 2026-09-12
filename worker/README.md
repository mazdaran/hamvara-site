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

## Tariff intelligence

- Public rules API: `/api/tariff/rules?as_of=YYYY-MM-DD&hts=CODE1,CODE2`
- Health and change status: `/api/tariff/status`
- Controlled administration: `/api/tariff/admin/*`

Tariff Control phase 1 is manually initiated and writes only to staging. Scheduled tariff
collection and production promotion are disabled. Reviewers can list staged runs, compare
before/after values, acknowledge a candidate, and record `ACCEPTED`, `REJECTED`, or
`NO_IMPACT` with a mandatory reason. Use separate Sync, Preparer, Reviewer and Publisher
credentials; actor identities are read from Worker configuration and are never accepted from
the request body.

Required controlled-role secrets and variables:

- `TARIFF_SYNC_TOKEN` / `TARIFF_SYNC_ACTOR`
- `TARIFF_PREPARER_TOKEN` / `TARIFF_PREPARER_ACTOR`
- `TARIFF_REVIEWER_TOKEN` / `TARIFF_REVIEWER_ACTOR`
- `TARIFF_PUBLISHER_TOKEN` / `TARIFF_PUBLISHER_ACTOR`

Pushes only run verification. Production D1 migration and Worker deployment are separate
manual GitHub Actions workflows and do not invoke one another.
- Manual USITC snapshot and diff: `POST /api/tariff/admin/sync`
- Candidate list: `GET /api/tariff/admin/sync-runs`
- Before/after worklist: `GET /api/tariff/admin/sync-runs/:id/changes`
- Evidence of review: `POST /api/tariff/admin/changes/:id/acknowledge`
- Controlled disposition: `POST /api/tariff/admin/changes/:id/disposition`

Migration `0005_tariff_intelligence.sql` creates the HTS snapshot, change, rule, fee, relationship and review tables. It is applied only through the separate, confirmation-gated D1 migration workflow; Worker deployment never applies it.

Configure all controlled-role secrets and actor variables listed above before using the administration endpoints. A new rule set starts as `DRAFT`. Every primary source must be reviewed before an independent user can move it to `VERIFIED`; a different user must publish it. The public API returns only `PUBLISHED` rule sets.

The default sync URL downloads the complete current HTS export from USITC. `USITC_HTS_EXPORT_URL` may be set only for a controlled compatibility change or test. The sync refuses to replace current data when fewer than 1,000 valid HTS-10 rows are returned.

## Growth integrations

After deployment, set `growth/config.js` `apiBase` to the Worker URL (later `https://api.hamvara.com`). OAuth callback URLs follow `https://api.hamvara.com/api/oauth/{provider}/callback`.

Providers: `google`, `meta`, `linkedin`, `wordpress`. No OAuth token is sent to the browser. Tokens are encrypted with AES-GCM before being stored in D1.
