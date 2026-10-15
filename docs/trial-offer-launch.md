# Trial offer proposal — 10 October 2026

Status: implemented as contact-only copy in the EN/FA/TR website preview. This is not a production entitlement change. Keep the preview labels and noindex until the gates below pass. The existing public apps must not be described as already enforcing this offer.

## Research and decision

Official pages checked on 10 October 2026:

- https://www.mrpeasy.com/pricing/ — Starter $49/user/month; 15+15-day trial without a card.
- https://katanamrp.com/pricing/ — current page offers Free up to 30 SKUs, unlimited SKUs for the first 15 days, and custom annual Advantage pricing. Older search results still quote Core $299/month; do not use that as the current quote.
- https://www.cin7.com/pricing/ — Core Standard $349/month, 5 users, excluding tax.
- https://www.cin7.com/start-a-free-trial/ — 14-day trial.
- https://www.odoo.com/trial — search result describes a 15-day no-card trial; direct retrieval failed. Do not rely on a universal regional price.
- https://matrixify.app/pricing/ — Shopify import/export comparison, not an exact substitute: free demo allows 10 products/job; Basic $20/30 days.

These competitors have different maturity, integrations and scope. Their prices do not establish feature parity or Hamvara's willingness-to-pay. Trial length alone is not a defensible advantage. The offer should reduce setup effort and produce a measurable outcome. Avoid unverified savings claims, artificial countdowns or permanent discount promises.

## Initial offer

MRP: 30 days after the workspace is usable and the customer agrees the start date; no card and no automatic paid conversion. One company/site and three named users. Include one scheduled 30-minute setup and one 20-minute results review. Offer inventory, receipt, BOM and a production-order workflow that has passed acceptance. Do not promise unreleased mobile, tax integrations or full ERP capability. Keep $590/year before tax as the proposed price for this scope; show $49.17/month only as an annual-price equivalent. Email product support is included; migration, custom development and integrations are separately scoped. Do not promise unlimited consulting or 24/7 response.

SKU Bridge: preserve the first-200-row free preview. Add a proposed evaluation allowance of three successful export downloads AND 200 total exported rows, valid for 30 days from activation. The first exhausted limit ends export access. This permits a real small-file outcome without supplying an unlimited one-off migration for free. Failed exports must not consume quota. Keep proposed $12/month or $120/year. An occasional customer can use one paid month; do not force annual purchase or hide cancellation.

At MRP expiry: stop new writes but allow 14 days of view/export access. No automatic charge or immediate destructive deletion. State retention/deletion policy before collecting real data; do not claim that this preview implements it. Purchase retains the same company and data, and begins the paid annual term on payment/activation, not on trial start.

Do not add MRP monthly billing silently: the owner previously chose annual-only. Revisit a $59 monthly experiment only if qualified prospects consistently reject the annual commitment; it needs an explicit commercial decision and Paddle price setup.

## Assisted activation and measurement

1. Before activation: confirm a real company/contact, one measurable problem, roles and support scope. Use a small agreed data sample; never ask for credentials or full confidential files through public support chat.
2. Days 1–7: prepare products and opening inventory. Target first successful receipt within 72 hours of agreed activation, not a guaranteed business result.
3. Days 8–14: validate one BOM and a material shortage calculation against the customer's manual calculation.
4. Days 15–21: follow one production order and a second user's participation.
5. Days 22–30: review measured time/accuracy and purchase or exit. Reminders on days 23 and 28, with a clear end date and explicit opt-in for marketing; no reminders are sent by this change.

Run an initial cohort of ten qualified companies, with at most three concurrent assisted onboardings to protect support capacity. Track requested/activated pilots, activation within 72 hours, completed operational scenarios, paid conversion among completed trials, support minutes, infrastructure cost, and retention at 60/90 days. Track SKU successful sample export, quota exhaustion and paid conversion separately. Ten customers give qualitative learning, not statistically reliable A/B results.

Economics: $590/year is $49.17/month before tax, payment fees, infrastructure and support. Estimate contribution using actual support time multiplied by an internal hourly cost, plus hosting and payment fees. Do not reduce price again until cost-to-serve is known. Refund promises are separate from a free trial and require separate policy review.

## Production gates (not implemented by this preview PR)

- Persist server-controlled trial start/end and plan version per tenant, not browser localStorage. One trial per verified company; abuse checks must not indiscriminately block shared factory networks.
- Enforce company/user/feature limits on the server. Reject writes at expiry even via direct API; continue authorized read/export in the grace period.
- For SKU exports, reserve/commit quota atomically with an idempotency key; count successful generated deliveries once, preserve retries, and enforce cumulative row limits against file splitting.
- Validate server timestamps and tenant isolation; test expiry boundary, clock changes, concurrent exports, failed export retry and repeat signup.
- Prove account creation, role assignment, data export and backup/restore in isolated staging before real customer data.
- Confirm final operator identity, data handling and retention. Ensure support/privacy notices reflect the live chat already present on the site.
- Complete Paddle webhook verification, deduplication and subscription lifecycle tests; trial expiry must not itself create a charge. Real activation/payment is gated separately from this content change.
- Test upgrade with unchanged company/data, cancellation, account export and the end of the grace period. Disclose renewal and cancellation before checkout.

## Validation for this change

Rebuild: `python3 _site-preview-source/build.py`. Existing source checks: `python3 tests/homepage/check_source.py`. Check each localized homepage for a single trial section, unique IDs, valid local link targets, RTL/mobile layout and contact-only CTA behavior. No new customer data, billing calls or email sends are introduced.
