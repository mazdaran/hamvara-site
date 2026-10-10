# Integrated pilot staging deployment

Branch: `codex/pilot-staging-integration`. This combines mobile receipts PR #11 with profiles/trials PRs #15–17. The receipt-phone route previously bypassed the main desktop authentication path; it now checks server trial access after authenticating its pairing and before processing receipt writes. Console routes run behind the trial gate. Signed-phone regression tests verify expiry denial.

## What is prepared

- Dedicated Worker `hamvara-pilot-staging`, separate D1 `hamvara-pilot-staging`, same-origin MRP assets.
- No production routes, AI, R2 or scheduled tasks inherited. Production UUID is explicitly rejected by the package generator.
- Two synthetic tenants: `pilot-tr` (TR / Turkish preference / Europe-Istanbul / TRY) and `pilot-us` (US / English preference / America-New_York / USD).
- Three named users per tenant: owner/CEO, operator, manager/production manager. Mobile warehouse grants for Product warehouse. Synthetic SKU TEST-001, barcode 8690526693361. No real customer data.
- Tenant clocks remain PREPARED until explicitly activated. Rerunning preparation/seed preserves credentials and existing state; it does not reset trial dates.
- Random credentials and secrets stay in ignored `.pilot-staging/`. Do not commit, attach or paste that directory. Keep it securely on the operator's computer. Windows file ACLs should restrict it to the owner.

## Execution on the operator's Windows computer

Use a fresh checkout to avoid altering the existing production/Paddle working folders:

```powershell
git clone --single-branch --branch codex/pilot-staging-integration https://github.com/mazdaran/hamvara-site.git hamvara-pilot-staging
cd hamvara-pilot-staging
npm ci --prefix worker
node worker/node_modules/wrangler/bin/wrangler.js login
```

In Cloudflare create a separate D1 database named **hamvara-pilot-staging**. Copy its UUID, not the production database UUID. Confirm the correct account in the browser login; set CLOUDFLARE_ACCOUNT_ID if the CLI offers multiple accounts. Then:

```powershell
node worker/scripts/deploy-pilot-staging.mjs <NEW-D1-UUID> --deploy-staging
```

That explicit command prepares the package, applies the branch's migrations to the separate D1, inserts synthetic fixtures, deploys the dedicated Worker and uploads its local generated administrator/audit secrets. It stops on the first failed command. No additional main-branch merge or production deploy is required. Review Wrangler's migration confirmation before accepting. If deployment stops after the Worker step, finish the secret upload before activation; do not treat partial deployment as ready.

Use the exact workers.dev URL printed by Wrangler. `/health` must report `environment: pilot-staging` and `databaseConfigured: true`. Read-only acceptance:

```powershell
node worker/scripts/check-pilot-staging.mjs https://hamvara-pilot-staging.YOUR-SUBDOMAIN.workers.dev
```

To activate ONLY these two internal synthetic tenants and test state access/profile/three-seat isolation:

```powershell
node worker/scripts/check-pilot-staging.mjs https://hamvara-pilot-staging.YOUR-SUBDOMAIN.workers.dev --activate-internal
```

The latter starts a real 30-day clock in staging and performs a deliberately rejected fourth-user attempt; it never resets an already-started clock. Do not repurpose it for customers. Keep the output free of keys.

Owner view: `/mrp/`. Mobile receipt console: `/mrp/mobile-receipts.html`. Use the corresponding private login from `.pilot-staging/credentials.json`. The trial-restricted mobile receipt cohort uses the server receipt workflow rather than legacy stock editing. The iPhone receipt form and staging-targeted Android build are still separate outstanding items; a successful staging API check does not establish phone receipt acceptance.

## Evidence and blocker

389 tests pass locally after integration, including generated seed applied twice to SQLite, separate countries/currencies, preserved keys, production UUID refusal and signed mobile trial denial. CI also runs the browser flows and Wrangler dry-run bundle. No remote resource has been created, no migration applied remotely and neither tenant is live from this development environment: it has no Cloudflare token/login/connector. The operator must run the deployment commands from their authenticated computer. Credentials do not need to be sent to the assistant.
