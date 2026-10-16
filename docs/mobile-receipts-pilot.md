# Mobile goods receipts: controlled SaaS pilot

## Scope

First vertical slice: Android draft capture → durable inbox → independent receiving → QC → Factory Manager approval → CEO posting. It uses the existing Cloudflare Workers/D1 service and inventory receipt/costing domain functions. No changes are active until a workspace is explicitly enabled. The corresponding mobile PR is https://github.com/mazdaran/hamvara-mobile/pull/1.

This is a scoped temporary scanner delegation from an authenticated web account, not yet independent OAuth mobile login. The scan-only Cloud REST API and portable relay are separate and do not inherit this transport's guarantees.

## Controlled rollout

1. Back up the selected pilot workspace and verify restoration before schema migration.
2. Apply `worker/migrations/0013_mobile_receipts.sql` to a staging D1 database first; deploy the matching Worker and static files there.
3. Configure `MRP_MOBILE_RECEIPT_WORKSPACES` to an explicit comma-separated list of **dedicated pilot workspace slugs**. Empty/unset leaves the feature disabled. Do not enable a customer's active workspace yet.
4. Seed master SKUs (including unit and cost), destination and quarantine warehouses, and independent users using existing administration. CEO may maintain SKU/warehouse masters through the existing ERP UI.
5. Open `/mrp/mobile-receipts.html`. CEO grants warehouse access to the submitter and reviewers. Roles and workspace membership are always checked server-side; accounting cannot mutate receipts.
6. Sign in as the submitter, choose a warehouse and create a QR. In Android 0.4.0-pilot scan it within 60 seconds. Compare device fingerprints and approve on web. Tap Connect / retry on Android.
7. Submit a sample receipt; sign in as a different reviewer. Receive into quarantine, accept QC, approve as Factory Manager and post as CEO. Check inventory, costing and audit records.
8. Test lost-response retry, airplane mode, re-pairing after expiry, app process restart, permission revocation and another company. Delete no uncertain outbox item until its server receipt is checked.

### Legacy write boundary

In enabled workspaces, non-CEO users use the dedicated console; the broad legacy state-read/write API is denied. CEO legacy saves cannot change inventory, receipts, quality, costing or journal fields. **Existing receipt, stock correction, production, shipment and other inventory-changing forms are consequently blocked in these pilot workspaces.** This is intentional until those operations have server command APIs. A stale ERP page returns a revision conflict rather than overwriting new receipt stock; refresh it before further work.

Only the new server receipt transitions can mutate those protected fields. Do not remove this guard to make an old form work. Disabling the flag is not a security-neutral rollback: it restores the old API behavior. Keep the flag set and revoke pairings to pause the pilot; retain submitted receipts and records for reconciliation.

## Protocol and integrity

- Pairing QR has a random temporary token; only its SHA-256 hash is stored.
- One key can claim a QR for 60 seconds, with same-key retry. Web approval confirms the fingerprint; pairing expires after 10 minutes and can be revoked.
- 2048-bit RSA proof from Android Keystore covers HTTP method, endpoint path, timestamp, nonce and SHA-256 body hash. Timestamp tolerance is 30 seconds. Nonce consumption is atomic; accepted proofs are retained for 60 seconds. The pilot admits up to 180 signed requests per pairing per rolling 60-second retention window.
- Drafts have a unique `(workspace_id, submitted_by, client_event_id)`. Same ID and payload returns the original receipt; different payload is a conflict. New submissions and their audit record commit in one D1 batch.
- Incoming quantity is not available inventory. Receiving creates quarantine stock and an IQC inspection; quality hold retains quarantine. Manager approval and CEO posting are separate server actions. The original submitter cannot review any stage.
- A receipt-version condition plus a SQLite revision trigger protects every state transition. Receipt status, inventory/cost state and audit commit in a single D1 batch. On conflict the entire batch rolls back; refresh before retrying.
- Catalog responses exclude costs. The inbox is limited by workspace, warehouse grant and, for operators, their own submissions. Last 100 receipts are shown in this pilot.
- The phone's AES-GCM outbox keeps company/user/warehouse scope across re-pairing. The local item is removed only after a server acknowledgement of durable receipt storage. It does not send pending work into another account.

## Verification and next phases

`node --test worker/test/mobile-receipts.test.mjs` uses SQLite to execute migrations, transactions, triggers and the actual request handlers with generated cryptographic keys. It covers complete posting, duplicate and concurrent requests, replay/expiry, cross-company access, permissions, stale state, audit-failure rollback and quality hold. Run `npm run check` from `worker` for the full suite.

Required before customer rollout: staging Cloudflare/D1 test (SQLite adapter is not a deployed Worker), web visual/interaction test and physical Android Keystore/offline test. Debug APK is not a production-signed distribution. Foreground/on-resume/manual retry is implemented; WorkManager, independent OAuth login/refresh rotation, per-user catalog paging, receipt corrections/returns, translations and iOS follow separately. Hold/rejection in this pilot is terminal and requires controlled reconciliation; there is no return-to-supplier workflow yet.
