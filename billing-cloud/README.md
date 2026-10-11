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
