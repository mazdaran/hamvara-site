# Company profiles and named users

Status: implemented for review; no customer workspace created by this change. Builds on tenant-isolation PR #15. At the start of this change, fetched GitHub main still pointed to 0b25c5a; the owner's reported deployment has not been independently verified.

## Deployment order

1. Review migration `worker/migrations/0014_mrp_workspace_profiles.sql`, which adds one table and does not change existing workspaces or ledger values. Number 0013 is reserved by the mobile receipts branch. Confirm the exact selected branch and migration list before running the existing manual D1 migration workflow; it applies all outstanding migrations on that branch.
2. Apply the reviewed migration to isolated staging first, then deploy this Worker and static MRP assets together. Older Worker versions can continue with the added table. No automatic migration or remote database write is performed in this change.
3. Provision two internal pilots, one TR and one US, using the helper below. Validate Settings > Company profile & named users, profile persistence, three-seat enforcement, owner login, member login and deactivation on staging.
4. Publish only after staging passes. Roll back code if needed; retain the additive table and customer data. The existing state/session API does not require this table unless a new management route or profiled provisioning is used.

## Provisioning a prepared pilot

Use the existing administrator token through `HAMVARA_MRP_ADMIN_TOKEN`, not a command-line argument. Keep it out of committed files and chat. Create a local profile JSON with real customer-approved values:

```json
{"country":"TR","language":"tr","timezone":"Europe/Istanbul","currency":"TRY","contactEmail":"owner@example.com"}
```

For a US company choose the actual company timezone, such as `America/New_York`, with country US, language en and currency USD. No country-based timezone guessing. English, Turkish and Persian are supported as communication preferences; this does not claim the entire application is translated.

From worker: `node scripts/create-pilot-workspace.mjs <https-api-base> <workspace-slug> <company-name> <profile-json-file> [owner-username]`.

The helper sends `pilot:true` and stores a server-side limit of three active named users, including the owner. Workspace, owner, profile and state are created in one database batch. The owner access key is returned once. Protect that output. This is prepared pilot provisioning, NOT activation of a 30-day entitlement.

## Company manager flow

A signed-in CEO opens Settings > Open company management. They can save country, preferred support language, timezone, operating currency preference and contact email. These preferences do not overwrite existing accounting settings, convert historical money values, change billing currency or translate the whole MRP interface. Application-wide use of these preferences remains a subsequent integration step.

The CEO can create operational users (operator, production manager, factory manager, accounting). Their key is shown once for private manual delivery. No email is sent; this is not an expiring invitation/acceptance flow. CEO creation and CEO changes remain administrator-only. The UI hides the key after acknowledgement and does not store it in localStorage.

Disabled users cannot log in or use their old mobile pairing. Deactivation frees a seat but retains the identity and audit trail; username reuse/reactivation is deliberately unavailable in this version. A CEO cannot disable themselves. Existing administrator key rotation remains available for credential recovery. Lists never return keys or hashes. The limit is checked inside the INSERT statement, and profile edits cannot raise it. Existing workspaces without a pilot limit retain their previous policy.

## Verification and remaining gates

Real-SQL integration tests cover separate TR/US profiles, invalid settings, pilot creation validation, role authorization, seat limits, unchanged legacy behavior, key secrecy, cross-company member IDs, self-disable prevention, and mobile revocation. Run `npm --prefix worker run check` from repository root.

Still pending: expiring invitations, application-wide regional preference adoption, server-owned 30-day trial and 14-day export grace, paid conversion, existing-workspace enrollment, full UI localization and real staging acceptance. Do not advertise those features as active.

Local result: all 364 Worker tests passed. Browser test execution was blocked locally because the browser download returned an invalid archive; the PR workflow includes the UI flow against the real SQLite handler for CI verification. No browser pass is claimed before CI succeeds.
