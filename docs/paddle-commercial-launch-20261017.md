# Hamvara + SKU Bridge — Paddle commercial launch gate (target 17 Oct 2026)

> **Status: sandbox functional; LIVE UNVERIFIED / NOT AUTHORIZED.** This is a release checklist, not a production deployment or an assertion that Paddle has approved the seller or checkout domain. No live payment must be attempted until all gates below pass.

## Preserve what already works

- Reuse local Windows checkout `C:\Users\yahya\hamvara-site-paddle` and its existing `feature/paddle-sandbox-checkout` state, ignored `.env`/user-environment variables, local SQLite database, existing Paddle Sandbox API key and separate endpoint signature secret. **Do not create a new sandbox key, reseed/replace databases, regenerate customer access keys, or delete Hookdeck history as a shortcut.**
- The existing separate Cloudflare Worker `hamvara-billing-sandbox` uses its own D1 and server-to-server `BillingAccess` RPC for internal TR/US MRP access. It is **not** an authorized live billing server.
- The live pilot `pilot.hamvara.com` stays a synthetic staging environment; do not connect live Paddle purchases to `pilot-tr`/`pilot-us` or to production MRP. Preserve `main` and production D1.
- The test catalog (not automatically the final commercial price) currently has SKU Bridge **$12/month**, **$120/year** and Hamvara MRP SaaS **$590/year**; do not invent live Paddle price IDs or offer trials/upsells as active until explicitly configured.

## A — User-controlled Paddle LIVE account gates (start now)

- [ ] In the **Paddle LIVE** dashboard (not Sandbox), verify legal individual / sole-trader onboarding and current **identity review** status. Domain and business verification conditions depend on Paddle's decision. No new company registration should be assumed; the legal account name must be accurate.
- [ ] **Website/domain approval:** Submit the actual public checkout website (`hamvara.com`) in Paddle > My account > Settings > Website approval, and wait for approved status. Sandbox approval is automatic and must not be confused with LIVE approval.
- [ ] Review public Hamvara privacy, terms, refunds/cancellation, pricing, clear product descriptions, and support/contact information; make checkout claims match delivered features. Resolve owner sign-off on SKU monthly/annual and MRP annual pricing, taxes, included sites/users, cancellation and refund language before publishing.
- [ ] Confirm payout/account and payment settings as required in LIVE. Never paste login, API keys, identity documents or bank details into GitHub/chat.

## B — Separate verified LIVE configuration (after Paddle authorizes LIVE)

- [ ] Recreate products and **prices** in Paddle LIVE. Sandbox `pri_`/`pro_` IDs never authorize LIVE products; obtain and privately map the real LIVE IDs, base period and currency. Keep code configuration **strictly environment-scoped**, no token/key reuse and no silent default to LIVE.
- [ ] Generate/authorize **separate LIVE API key and client-side token** in Paddle LIVE only when needed. This does not replace the existing Sandbox key; store LIVE API key server-side only.
- [ ] Provision an HTTPS, always-available dedicated LIVE webhook endpoint isolated from test tenants and databases. Configure a LIVE notification destination for transaction/payment, subscription lifecycle (created/updated/canceled/paused/resumed/past-due) and adjustments/refunds. Keep sandbox Hookdeck and keys separate; webhook IP validation is defense in depth, signature verification over raw bytes is mandatory.
- [ ] Verify replay/idempotency and durable intake before HTTP 200, reject wrong environment/price/customer, prevent owner spoofing, duplicate charge, subscription retroactivity and canceled/refunded access. Add a manual authorized Paddle API reconciliation path for missed events.
- [ ] Implement **real customer signup and tenant-owner binding** for live SKU Bridge personal account and one MRP company/site, role-specific staff access and safe invitation/revocation. The local fixtures (`mrp-owner`, `sku-alice`) and two seeded pilot companies are never production identities.
- [ ] Enforce paid SKU CSV exports and MRP workspace access against the LIVE server's verified entitlement in actual production applications. Checkout success in the browser is never sufficient.
- [ ] Configure receipt/invoice support, taxes, refunds, dunning, renewal/cancellation and error notification. Customer data retention, backup recovery, service-level and incident plan must be approved.

## C — Acceptance evidence / launch decision

- [x] Existing isolated **Sandbox** completed checkouts, server-side entitlement and separate pilot companies tested; internal TR/US access read/write verified on 16 Oct via `pilot.hamvara.com`.
- [x] Test of physical iPhone Safari → signed receipt → review/QC/posting → Product stock, plus internal TR/US desktop receipts. This proves pilot operation only, not paid-customer provisioning.
- [ ] CI: all sandbox webhook/fulfillment/auth/replay tests green on the exact reviewed SHA. New workflow `.github/workflows/paddle-sandbox-release-gates.yml` is non-deploying.
- [ ] LIVE merchant/domain approval evidence (timestamp + status) from dashboard, no private data.
- [ ] First controlled LIVE end-to-end checkout with owner consent, actual payment, verified LIVE signed webhook, subscription binding and a **real** application entitlement. Never simulate a successful live payment.
- [ ] Verify renewals, cancellation/pause, past due, refunds and duplicate/out-of-order/missing events on isolated test actors, then verify backup/recovery. Run a known-good rollback rehearsal.
- [ ] Owner expressly approves production release. Until then leave LIVE checkout disabled and Sandbox clearly labeled as test-only.

## What 'ready by 17 Oct' can mean

If Paddle identity/domain reviews are still pending, deliver an independently reviewed, passing **technical prelaunch candidate** and complete the user-side verification requests. Do **not** label a Sandbox checkout or an unapproved Live account as taking real payments. External reviews may take several days.

## Current sources

- [Paddle setup checklist](https://developer.paddle.com/build/set-up-checklist/)
- [Paddle go-live checklist](https://developer.paddle.com/build/go-live-checklist/)
- [Paddle checkout-domain approval](https://developer.paddle.com/api-reference/checkout-domains/)
- [Subscription access/webhooks](https://developer.paddle.com/build/subscriptions/provision-access-webhooks/)
- [Paddle identity verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification)

Operator note: **Do not run** the old staging initialization, the local seed or `prepare.mjs` on an existing deployed billing D1. Existing Sandbox payments and access are real test evidence and should be preserved.
