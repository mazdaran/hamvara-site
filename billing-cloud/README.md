# Permanent Paddle sandbox webhook inbox

This isolated Worker receives sandbox webhooks directly from Paddle into a dedicated D1 database. It does not grant application access yet. Existing laptop checkout and fulfillment stay unchanged. Production credentials and databases must not be used.

## What is verified

- HMAC-SHA256 proof over original request bytes, with five-second timestamp tolerance and multiple h1 signature support.
- Durable storage before HTTP 200; database failure produces 503 for retry.
- Event deduplication by event_id; delivery notification_id and JSON key order do not create false conflicts.
- Conflicting business payload under the same event ID produces 409 for investigation.
- Supported lifecycle events stay PENDING for a later entitlement projector. Arrival order never determines subscription state.
- Stored payload excludes customer email/address, payment method, unrelated custom_data and product descriptions.
- No public endpoint reads the inbox. Health exposes configuration booleans only.

## Deploy, from repository root in PowerShell

Use a separate checkout of branch codex/billing-cloud-sandbox. Install the existing worker dependencies with npm ci --prefix worker. Keep all secrets out of chat and git.

1. `node worker/node_modules/wrangler/bin/wrangler.js d1 create hamvara-billing-sandbox`
2. `node billing-cloud/prepare.mjs NEW_DATABASE_UUID`
3. `node worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply hamvara-billing-sandbox --remote --config billing-cloud/.local/wrangler.json`
4. `node worker/node_modules/wrangler/bin/wrangler.js deploy --config billing-cloud/.local/wrangler.json`
5. In Paddle Sandbox, add a notification destination using the printed Worker URL + `/webhooks/paddle`. Select the event types in worker.mjs. Use this destination's own secret, not the existing API key or Hookdeck destination secret.
6. `node worker/node_modules/wrangler/bin/wrangler.js secret put PADDLE_SANDBOX_WEBHOOK_SECRET --config billing-cloud/.local/wrangler.json`
7. Open `/health`; expect configured true and fulfillment not_connected. Use Paddle's webhook simulator, then verify only event ID/type/status using D1. Replay should not add a second row. Turn off the laptop and send another simulation to validate independence.

Do not disable the old notification destination yet. Do not place live payments through this sandbox inbox.

## Next integration gate

Persist server-generated purchase intents and transaction ownership, migrate the existing catalog/lifecycle projector to D1, and connect verified entitlements to SaaS workspace/trial enforcement. Test paid, past_due, canceled, refunded, out-of-order, duplicate, unknown-price and cross-tenant cases before enabling customer purchases. No client-supplied workspace ID alone may grant access.

References: https://developer.paddle.com/webhooks/about/signature-verification/ and https://developer.paddle.com/webhooks/about/how-webhooks-work/

Run: `node --test billing-cloud/worker.test.mjs`

## Cloud checkout and entitlement pilot

After updating this branch, run `node billing-cloud/install.mjs` from the Windows checkout. It validates the existing dedicated D1 UUID, applies migration 0002, creates two independent **billing test** users/companies (not MRP tenants), applies hashes of their 30-day access keys, then deploys. Reruns reuse local keys. Stop on any error; never delete the database or repeat a purchase to recover an uncertain checkout.

The existing Windows User environment API key can be loaded without printing it:

```powershell
$env:PADDLE_SANDBOX_API_KEY = [Environment]::GetEnvironmentVariable('PADDLE_SANDBOX_API_KEY','User')
node billing-cloud/upload-api-key.mjs
```

This helper supplies the key to Wrangler via stdin, never arguments or a repository file. Only sandbox keys work. The existing webhook secret stays configured.

Open the Worker `/billing` page. Copy owner A's generated key locally with:

```powershell
(Get-Content billing-cloud/.local/billing-test-access.json -Raw | ConvertFrom-Json).accounts[0].accessKey | Set-Clipboard
```

Sign in, select a sandbox plan and Prepare checkout. Click Open Paddle test checkout, then Open checkout. After a Paddle sandbox purchase, return and Check access. No automatic polling runs. Use owner B in another private window to confirm owner A's subscription is not visible. `/pay` runs Paddle.js in a separate page from the billing access key. Keys remain in page memory, are not stored in browser storage, and can be revoked with `UPDATE billing_keys SET revoked=1 WHERE user_id='billing-owner-a'` in this isolated D1.

The sandbox catalog is unchanged from the laptop prototype ($12/month, $120/year SKU Bridge, $590/year MRP); these are existing **test prices**, not a change to published pricing.

Verified signed `evt_` events and server-created transaction bindings are required. Simulator `ntfsimevt_` events remain stored for delivery tests but **cannot grant access**. There is no browser-provided owner/company/amount. A unique scope+owner+product constraint prevents concurrent double checkout creation and uncertain timeouts from causing another charge. The same existing ready checkout is returned on retry. Upgrades and replacement checkouts need a later explicit workflow.

The projection reuses the laptop lifecycle rules (paid period, active subscription, cancellation, refund/dispute, grace, catalog and company limits) over an atomic D1 snapshot. It is computed on authenticated Check access requests, not by a timer. It fails closed beyond 5,000 normal events or 500 identity/intent rows rather than using incomplete history. The inbox processing_status remains PENDING: it records receipt, not the on-demand entitlement projection. Do not interpret it as an activation failure.

**Scope boundary:** This verifies cloud billing ownership and entitlements. The optional pilot-only MRP service binding is described below. SKU Bridge quotas and production billing are not connected. `/health` reports `fulfillment: sandbox_entitlements`, `applicationIntegration: not_connected`, and a separate checkoutConfigured boolean. No MRP tenant or production DB is modified.

Run `node --test billing-cloud/*.test.mjs`. Then verify a real sandbox checkout through Paddle; the pre-existing simulator fixtures are insufficient to verify paid entitlement ownership.


## Pilot MRP service binding

Deploy billing first: run `node billing-cloud/enable-service.mjs`, then deploy with the existing `.local/wrangler.json`. The named `BillingAccess` entrypoint exposes `companyAccess` only through Cloudflare service RPC, not through a public HTTP route. No key is sent to a browser or phone.

In the separate pilot staging checkout, update `codex/pilot-staging-integration`, run `node worker/scripts/connect-billing-sandbox.mjs`, and deploy with `.pilot-staging/wrangler.json`. No migration, reseeding or new secret is required. If the pilot preparation script is run again, run the connection helper again before deployment.

Only `pilot-tr-workspace` maps to billing company A and `pilot-us-workspace` to company B. These are synthetic test companies, not customer onboarding. Mapped workspaces require verified MRP entitlement and respect the active user limit. Web, legacy scan and paired receipt routes use the same check. Inactive entitlement returns 403 for operational access; service failures return 503. Existing role checks remain in force. Other workspaces retain their trial rules.

Verify A cannot access MRP operations while B can; verify the paired phone follows the same result. Account/session status remains available for a subscription-required result. Production is unchanged. The `/health` integration field is a legacy billing-only indicator, not a live probe of the pilot binding.
