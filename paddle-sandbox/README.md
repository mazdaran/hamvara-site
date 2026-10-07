# Isolated local Paddle sandbox fulfillment prototype

Static HTML/CSS/JavaScript plus a loopback Node server and a separate SQLite test
database. No ERP, production authentication, Cloudflare or production D1 changes.
No packages need installation. Requires Node 24 with built-in node:sqlite (tested
with 24.20.0). This is a test prototype, not a production service.

## SKU Bridge product workspace (v5)

Open `http://localhost:8081/sku-bridge/` using the fulfillment server on port 8081.
The SKU page now has separate UI, styles and a shared validation module. The local
server injects only the existing sandbox access adapter. Static hosting provides
free preview without an export connection. No production deployment is included.

- CSV/TSV handles quoted multiline cells, escaped quotes, explicit separators,
  header selection and UTF-8/UTF-16 decoding. Malformed/oversized input fails clearly.
- XLSX/XLS reading lazily loads SheetJS CE 0.20.3 from its official CDN. Internet
  access is required for that reader. Sheet selection is supported; formulas and
  merged cells are rejected. CSV remains available if the reader cannot load.
- Review checks required SKU/price, case-insensitive duplicate SKUs (preserving
  separators), GTIN length/check digit, nonnegative numeric fields, min/max order,
  and three-letter uppercase currency syntax. No currency conversion or barcode
  ownership validation is performed. Empty optional fields are allowed.
- Safe changes are previewed, never merged automatically, and can be undone.
  All rows require explicit approval. Table pagination, filtering, search and an
  issue report help review larger files. One local column mapping can be remembered
  or removed; product rows are not persisted in the browser.
- The free preview is 200 rows. A verified personal SKU entitlement allows review
  up to 10,000 rows and server-generated approved CSV. After payment, return to
  mapping and review again to expand a truncated preview.
- Export rechecks session, CSRF, ownership and durable entitlement every time.
  Refunds, cancellations, pauses and expiry still revoke access under existing rules.
  The server uses the same validation module and ignores client parsing overrides.
- Approved rows go to the local server for validation/CSV creation and are not saved.
  The CSV uses BOM, proper quotes/newlines and neutralizes formula-leading text.
  Import identifier columns as Text in Excel to preserve leading zeros.
- Limits: 10 MB import; 10,000 data rows; 100 source columns; 2,000 characters per
  cell; 1 MiB export request. These technical limits are not new pricing allowances.
- Working edits disappear on reload/close. English and Turkish copy are included.
  No remote AI analysis or analytics collection is included in the SKU workspace.

Use synthetic data with these fixture accounts. The UI/controller and server tests
are automated; actual browser rendering and real XLSX-reader loading still need a
local browser check. Live authentication, Paddle production provisioning and public
launch remain separate work. ERP, Worker, production D1, price IDs and the local
billing database are not modified by this patch.

## Start locally

```powershell
Set-Location 'C:\Users\yahya\hamvara-site-paddle'
node paddle-sandbox/fulfillment/server.mjs --seed
node paddle-sandbox/fulfillment/server.mjs
```

Open **http://localhost:8080/paddle-sandbox/** (localhost, not 127.0.0.1).
Stop with Ctrl+C. The server binds only to loopback and requires the localhost
Host/Origin. Only explicitly allowlisted page files are served; server/database
files are never served. serve.cjs remains a static-only preview without fulfillment.
Seeding is idempotent and does not reset records. Test data is stored at
`fulfillment/data/sandbox.sqlite`, ignored by the nested .gitignore.

If port 8080 is occupied, run `node paddle-sandbox/fulfillment/server.mjs --port=8081`
and open http://localhost:8081/paddle-sandbox/. Same-origin checks use that port.

## Pre-created test accounts

All use the deliberately public fixture password **Sandbox-test-only-2026!**.
These are local test credentials, never production credentials.

| Username | Identity | Authorization |
|---|---|---|
| sku-alice | Standalone SKU user | Own SKU purchases only |
| sku-bob | Separate standalone SKU user | Own SKU purchases only |
| mrp-owner | MRP test user | Explicit billing owner of Test Company A |
| mrp-member | MRP test user | Company A member; cannot purchase for it |
| mrp-other-owner | MRP test user | Explicit billing owner of Test Company B |

Each company has one fixed test site and pre-created memberships. There are no
signup, company-selector, membership-editing or ERP provisioning endpoints. SKU
identity is independent of MRP. Company entitlements are visible only to members;
purchases require its assigned billing owner. Multiple owned companies fail closed
rather than accepting a browser owner ID.

One-hour sessions use random tokens stored hashed, HttpOnly/SameSite=Strict cookies,
and CSRF tokens for authenticated writes. Passwords use salted scrypt; login has a
local rate limit. JSON POSTs require the exact same origin. HTTP cookies deliberately
lack Secure on this loopback HTTP prototype. Do not expose fixture login publicly.

## Required server-only sandbox configuration

The public sandbox client-side token is already in config.js. Only that token
belongs in browser code. The server reads exactly these environment variables,
never loads .env files, and never prints their values:

- `HAMVARA_PADDLE_SANDBOX_API_KEY`: sandbox API key beginning `pdl_sdbx_apikey_`.
  Grant **transaction.write** (includes read) and **subscription.read**. No catalog,
  customer, subscription-write or production permissions are needed. The code only
  contacts https://sandbox-api.paddle.com, rejects redirects, and rejects live keys.
- `HAMVARA_PADDLE_SANDBOX_WEBHOOK_SECRET`: endpoint secret from the sandbox
  notification destination. It is not the API key or client-side token.

Use masked input in the PowerShell process starting the server:

```powershell
$sandboxApiInput = Read-Host 'Sandbox API key' -AsSecureString
$env:HAMVARA_PADDLE_SANDBOX_API_KEY = [System.Net.NetworkCredential]::new('', $sandboxApiInput).Password
$sandboxWebhookInput = Read-Host 'Sandbox webhook endpoint secret' -AsSecureString
$env:HAMVARA_PADDLE_SANDBOX_WEBHOOK_SECRET = [System.Net.NetworkCredential]::new('', $sandboxWebhookInput).Password
node paddle-sandbox/fulfillment/server.mjs
```

Do not print the variables, put them in config.js or commit them. Close that shell
or remove these two variables afterward. Missing server credentials disable checkout.
The Paddle MCP connection does not supply credentials to this separate Node process.
Configure the sandbox default payment-link URL if Paddle requires it for transaction
creation. This module does not modify Paddle account settings or create keys.

## Webhook-only local forwarding (prepared, not started)

Paddle currently recommends Hookdeck CLI for local forwarding. The isolated
`fulfillment/webhook-relay.mjs` binds to **127.0.0.1:8082** and forwards only the
literal **POST /api/sandbox/webhook** to 127.0.0.1:8081, with Host localhost:8081.
Never point a public tunnel directly at 8081. The relay rejects all other routes,
methods, query strings and encoded aliases. It cannot serve files or query SQLite.
It forwards unchanged body bytes and Paddle-Signature only, plus fixed transport
headers; cookies and browser ownership headers are not forwarded. Signature,
timestamp and event validation remain in the existing receiver, unchanged.
Upstream errors are propagated without internal response bodies/headers.

Preparation does not start a tunnel or create a Paddle destination. When you decide
to start forwarding, use these separate PowerShell terminals:

1. In your existing server terminal (the sandbox API key is already loaded), obtain
   the **real endpoint secret** from the sandbox notification destination, then:

```powershell
Set-Location 'C:\Users\yahya\hamvara-site-paddle'
$sandboxWebhookInput = Read-Host 'Real sandbox notification destination secret' -AsSecureString
$env:HAMVARA_PADDLE_SANDBOX_WEBHOOK_SECRET = [System.Net.NetworkCredential]::new('', $sandboxWebhookInput).Password
Remove-Variable sandboxWebhookInput
node paddle-sandbox/fulfillment/server.mjs --port=8081
```

Stop an already running server with Ctrl+C before restarting it; do not seed/reset.
If the destination has not yet been created, start the relay and forwarding first,
create the sandbox destination using the printed URL, then load its secret and start
the server. Deliveries cannot succeed until that secret is configured.

2. In a new terminal start the local relay (no credentials needed):

```powershell
Set-Location 'C:\Users\yahya\hamvara-site-paddle'
node paddle-sandbox/fulfillment/webhook-relay.mjs
```

3. In another terminal, install the CLI if it is not already available, then start
   forwarding **only when public forwarding is wanted**:

```powershell
npm install --global hookdeck-cli
hookdeck listen 8082 paddle-sandbox --path /api/sandbox/webhook
```

Use the exact HTTPS URL printed by Hookdeck as the sandbox notification destination;
do not append a path to that URL. Select the eight events listed below and choose
traffic source "all" if you want actual sandbox events plus Paddle simulations.
Hookdeck is a third-party intermediary that receives webhook payloads/signatures.
Its source URL is public and forwards to the webhook-only relay, not the full site.
Local login, checkout APIs, source files and SQLite remain inaccessible through it.
The public source/forwarding service may acknowledge receipt before local delivery;
inspect both Hookdeck delivery status and Paddle notification logs when testing.

Keep automatic signature transformations disabled. The receiver's five-second
timestamp tolerance stays enabled: queued/replayed deliveries can be rejected as
stale. For a fresh signed test, trigger a new Paddle sandbox event or simulator run.
Do not increase tolerance or grant access from unverified forwarded payloads.
Stop the CLI and relay with Ctrl+C after testing; disable/delete the sandbox
notification destination when finished (Hookdeck may retain/queue deliveries).

Local verification (no public connection or real secrets):

```powershell
node --test paddle-sandbox/fulfillment/webhook-relay.test.mjs
```

References: https://developer.paddle.com/webhooks/about/
and https://developer.paddle.com/webhooks/about/signature-verification/

## Webhook receiver and remaining setup

Receiver: `POST http://localhost:8080/api/sandbox/webhook`. Paddle cannot deliver
directly to localhost. Real delivery needs a reachable HTTPS destination, which
the prepared relay above can provide when explicitly started. No deployment or
public forwarding was started during preparation. Real delivery remains untested.

When HTTPS delivery is authorized later, configure a **sandbox-only** notification
destination for transaction.completed and subscription.created, subscription.updated,
subscription.activated, subscription.past_due, subscription.paused,
subscription.resumed and subscription.canceled. Use that destination's endpoint
secret and sync the local clock. Forward only the webhook route, rewriting Host
to localhost:8080; do not expose test login, database or protected resources.
No notification destination was created or modified during implementation.

The receiver verifies HMAC-SHA256 over timestamp, colon and **unchanged raw bytes**,
uses timing-safe comparison, accepts multiple h1 signatures, and enforces five-second
timestamp tolerance in both directions. Parse JSON only after verification. Store
lean verified receipts durably before HTTP 200; a failed write does not ACK.
Deduplicate event_id; the same ID with changed bytes is rejected.

No external processing runs before ACK. Entitlements are deterministic projections
of the durable inbox on reads/restarts, so no volatile queue can lose fulfillment.
Subscription updates are ordered by occurred_at; equal-time contradictory snapshots
fail closed for review. Email, address and payment-method details are not retained.

## Secure ownership and checkout

The browser sends only an allowlisted plan and a retry request key. The server
resolves the authenticated user or their explicitly assigned company. Browser
ownership fields are rejected and checkout email is never used as ownership proof.
Store a purchase intent before creating one automatic USD Paddle transaction with
one existing price, quantity 1 and opaque intent ID in custom_data. Store the
transaction ID before returning it; Paddle Checkout opens using **transactionId**.

Browser completion updates a message only. "Check verified test access" reads the
server decision. Only the exact initially created transaction plus matching intent
reference can establish a subscription-owner binding. Renewal uses that existing
binding and matching customer/subscription/price, never arbitrary custom data.
Old unassigned checkout tests remain review evidence, not auto-linked by email.

Same request keys reuse transactions. Uncertain API creation puts the intent into
review; neither the same key nor a fresh key for that owner/plan creates a replacement.
Inspect the sandbox transaction and local intent before resolving uncertainty.

| Plan | Existing price ID | Base USD / period |
|---|---|---|
| SKU monthly | pri_01m4783eb2dd2j2xqxpdtgxpa8 | 12 / month |
| SKU annual | pri_01m4783em9cvg4y6v9jm403wwm | 120 / year |
| MRP annual | pri_01m4783exjj9kzkbdt2vzp8k79 | 590 / year |

No catalog writes. PricePreview still displays applicable taxes. Do not hardcode
tax-inclusive totals from previous tests. Fulfillment validates price/product,
USD base amount, billing cycle, quantity 1, no trial/override/discount, completed
transaction, balanced totals, paid period and matching subscription state.
Missing or contradictory evidence gives no paid access.

## Lifecycle rules

- Initial access needs both a completed verified payment and matching active
  subscription; either event may arrive first. Subscription creation alone is insufficient.
- Renewal extends paid-through only from completed payment evidence. Active
  subscription status alone cannot extend it.
- Past-due renewals receive **7 days after paid-through**, then paid access is
  suspended. Repeated notifications do not reset this deadline. No data is deleted.
- Scheduled cancel/pause caps access at its effective time and paid-through.
  Actual canceled/paused status revokes immediately. Resume needs a paid period.
- Unexpected trials, plan changes, proration, unknown ownership, invalid periods
  or contradictory state fail closed for review.
- SKU: one test user, same monthly/annual features. MRP: one company/site, at most
  five active test members; excess membership suspends the prototype entitlement.

Protected `GET /api/sandbox/product/sku` and `/api/sandbox/product/mrp` endpoints
require authenticated eligible owners/members and return a small test resource.
They do not unlock existing SKU/ERP applications. Production enforcement and
provisioning remain separate work. No storage, AI or future premium claims are added.

## Reconcile missed sandbox events

With the server-only API key set:

```powershell
node paddle-sandbox/fulfillment/reconcile.mjs
```

Read-only against Paddle: fetch local ready intents and related subscriptions and
completed transactions. Write authenticated API snapshots to the local inbox.
Snapshots are marked `sandbox-api`, **not signed webhooks**. updated_at participates
in ordering and repeated runs are idempotent. Run manually after test payments while
webhook delivery is unavailable, or after missed events. No ownership inference for
old checkouts and no automatic repair of uncertain transaction creation.

## Tests and remaining checks

```powershell
node --test sku-bridge/*.test.mjs paddle-sandbox/app.test.cjs paddle-sandbox/sku-access.test.cjs paddle-sandbox/fulfillment/*.test.mjs
```

Tests use generated HMAC signatures with an explicit fake secret, fake Paddle API
responses, memory/temporary SQLite and loopback HTTP. They are **simulated local
security/lifecycle tests**, not real Paddle webhook tests. They never contact Paddle.
Coverage includes signatures/replay, sessions/CSRF/origin/host, ownership isolation,
idempotency, reordered events, renewal, grace expiry, cancel/pause/resume, restart
persistence, browser completion non-authority and API reconciliation.

Remaining real checks: API credentials/permissions, server-created sandbox checkout,
authenticated sandbox API reconciliation and real signed webhook delivery.
Refund/chargeback handling and local SKU CSV enforcement are implemented. Plan
switching and production provisioning remain outside this prototype. Before
production, replace fixture authentication and review transport and retention.

Guidance consulted through paddle-docs:

- https://developer.paddle.com/webhooks/about/signature-verification/
- https://developer.paddle.com/webhooks/about/respond-to-webhooks/
- https://developer.paddle.com/build/subscriptions/provision-access-webhooks/
- https://developer.paddle.com/api-reference/transactions/create-transaction/
- https://developer.paddle.com/build/transactions/custom-data/
- https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/
- https://developer.paddle.com/api-reference/about/permissions/
