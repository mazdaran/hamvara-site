# Mobile receipt staging

This is a separate pilot Worker and D1 database. Production wrangler.toml, routes, secrets, R2, AI and cron settings are not inherited. No production deployment is needed to run this pilot. The phone receipt page is still the Android-only placeholder; iPhone form and a staging-targeted Android build follow after the staging URL exists.

## One-time setup (local terminal)

1. In Cloudflare → Storage & databases → D1, create **hamvara-mobile-staging**. Record its database UUID. Do not reuse the production database.
2. Check out `codex/mobile-saas-receipts` in a separate local clone. From the repository root run `npm ci --prefix worker`.
3. Run `node worker/scripts/prepare-mobile-staging.mjs <NEW-DATABASE-UUID>`. This creates a config, selected static assets, seed SQL and four random login keys in ignored `.mobile-staging/`. It rejects the production database ID. Do not upload this directory or paste its login keys into chat. Keep the directory private on your computer; Windows file ACLs depend on your user directory permissions.
4. Authenticate the CLI using `node worker/node_modules/wrangler/bin/wrangler.js login`. Select the Cloudflare account containing the new database. Credentials stay on your computer.
5. Before remote writes, inspect `.mobile-staging/wrangler.json` and verify its UUID matches **hamvara-mobile-staging** in the dashboard. For multiple accounts set `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
6. Apply migrations: `node worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config .mobile-staging/wrangler.json`.
7. Seed test users/items: `node worker/node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config .mobile-staging/wrangler.json --file .mobile-staging/seed.sql`.
8. Deploy only the staging service: `node worker/node_modules/wrangler/bin/wrangler.js deploy --config .mobile-staging/wrangler.json`.
9. Open the exact workers.dev URL printed by Wrangler. `/health` must report `environment: mobile-staging` and `databaseConfigured: true`. `/mrp/mobile-receipts.html` is the review console. Log in to workspace `mobile-pilot` with `operator`, `production`, `factory` or `ceo` and the corresponding local key from `.mobile-staging/credentials.json`.

The seed creates SKU `FG-TEST-PRODUCT-001`, barcode `8690526693361`, unit `pcs`, Product and Quarantine warehouses, and zero stock. Each user has Product warehouse permission. Re-running the seed does not overwrite existing stock or rotate keys. Credentials must be retained with this database; losing them requires a deliberate key-reset procedure, not silently reseeding.

## Acceptance still needed

The package can be checked without credentials using `wrangler deploy --dry-run` with the generated staging config. Local SQLite validates migrations and seeding; neither proves a remote D1 deployment. After deployment, verify console login and barcode lookup, then pair staging-targeted clients and test receipt posting, replay/lost responses and revocation. QR links use the current console origin; the production Android build intentionally rejects unknown staging origins until its separate build configuration is added.

Only synthetic test data belongs here. This pilot is not a backup or a copy of a customer's company.
