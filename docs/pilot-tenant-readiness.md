# Pilot tenant readiness — 10 October 2026

## Scope and current evidence

Prepare capacity for up to 20 qualified prospects across Turkey and international markets. Create a customer workspace after the customer agrees to a pilot; do not start 20 unused trials. Begin with two internal staging tenants and then three real pilots, with at most three concurrent assisted onboardings.

The existing tenant is `mrp_workspaces`; identities, state, audit records, backups and run artifacts are linked by workspace ID. Provisioning already creates a workspace and CEO identity in one database batch. Authentication resolves the workspace and user together, checks both are active, and compares a hashed access key. Keys must not be shared by multiple named users.

This change addresses two mobile pairing gaps:
- Every scanner request now requires the pairing's workspace and originating user to remain active and belong to the same workspace.
- A first-device claim is re-read after the conditional write. A competing device that loses the claim cannot read the session or submit an event.

Six integration tests execute the actual handler and SQL against in-memory SQLite, using two workspaces provisioned through the API. They cover separate state, foreign-key credentials, cross-company scan read/close/confirm denial, inactive workspace/user denial, competing device claims, and closed/expired sessions. All 360 Worker tests pass locally. This is scoped evidence, not a complete security audit or a Cloudflare staging acceptance result. No production database was accessed or migrated and no real customer tenant was created.

## Ordered implementation gates

1. **Tenant isolation foundation — code tested, deployment pending.** Merge the reviewed changes and reconcile them with the mobile receipts branch before staging. Test two internal companies on isolated staging, including actual browser/mobile pairing. Existing scanner event sequence allocation uses count-plus-one and needs a separate concurrency test before simultaneous production scanning is promised. Key rotation should also explicitly revoke derived pairing sessions; currently inactive-user/workspace checks and the 15-minute expiry bound them.
2. **Tenant settings and named-user onboarding — pending.** Store language, IANA timezone, operational currency, contact email and country on the server. Turkey defaults: Turkish / Europe-Istanbul / TRY. US: English / customer-selected timezone / USD. Never assume one timezone for the US. Separate operational currency from subscription billing currency. Validate and expose settings in session/UI. Design expiring single-use invitations, acceptance and per-user key revocation; enforce three active named users transactionally. Avoid sending credentials through public chat or command-line arguments.
3. **Trial lifecycle — pending.** Server-owned plan version and states: prepared, scheduled/active, read/export grace, expired, paid. Activation requires readiness plus agreed start instant; 30 days active and 14 days read/export grace. Define exact UTC boundaries displayed in tenant timezone, idempotent activation, limits and policy for post-grace data retention. Existing tenants must not accidentally be converted to trials. Cover desktop, direct API and mobile write paths. Paid conversion retains workspace and data. No automatic billing at trial expiry.
4. **Pilot data and acceptance — pending.** One company/site, up to three named users. Isolated sample data with explicit reset, then products/opening stock, receipt, BOM/shortages and one production order. Verify roles, backup/restore and export before accepting real operational data. Do not claim Turkish e-Fatura or US tax/accounting compliance from currency selection.
5. **Operator dashboard — pending.** Company, locale, onboarding stage, agreed start/end, last meaningful activity, next follow-up and result. Admin-only access; prevent tenant listing by ordinary customers. Track support time and infrastructure cost. No polling loop solely to update trial state; derive access from server time when handling requests.
6. **Staged customer rollout — pending.** Two internal staging tenants -> three real pilots -> expand toward 20 as support capacity allows. Turkish and English onboarding material, remote demo and local visits by arrangement. No outreach or automated reminder messages are sent by this change.

## Release gates

The pricing offer remains a preview. Do not advertise automated activation until gates 2–4 pass. Changes in this branch do not require a D1 schema migration. Run `cd worker && npm run check`. The PR workflow runs the same checks with Node 22. Production release and customer creation remain separate from these local tests.
