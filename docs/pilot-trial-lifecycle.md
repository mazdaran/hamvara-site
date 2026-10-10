# Pilot trial lifecycle — release notes and rollout

Builds on PR #16 (profiles and users). This change implements the server-owned 30-day pilot and 14-day read/export grace. No production migration, activation, email, payment or customer-data deletion was performed during development.

## Deployment and activation

1. Review and apply 0014 then 0015 in isolated staging before deploying this Worker. Migration 0015 creates `mrp_trials` and enrolls existing profiles with `member_limit=3` as PREPARED without starting their clock. **Those previously prepared pilots become blocked for operational state access until activation.** Ordinary workspaces without a trial row retain legacy access. Check which workspaces will be enrolled before production migration. The manual migration workflow applies all outstanding migrations on its selected branch; 0013 belongs to mobile receipts and must be reconciled separately.
2. Publish the Worker and `mrp/cloud.js` together in staging. Validate one Turkey pilot and one US pilot. Existing operational state and identities are preserved.
3. Create a prepared pilot using `create-pilot-workspace.mjs` from PR #16. Agree readiness and the start instant with the customer. Preparation allows management API operations for profile/named users; the operational client waits for activation.
4. Set the existing administrator token privately in `HAMVARA_MRP_ADMIN_TOKEN`. Run from worker:
   `node scripts/activate-pilot-trial.mjs <https-api-base> <workspace> <UTC-start-ISO> --ready --customer-agreed`.
   Convert the agreed local time to explicit UTC. A valid example format is `2026-10-12T09:00:00Z`; use the actual agreed date, not this example blindly.
5. The endpoint is administrator-only: `POST /api/mrp/workspaces/:slug/trial/activate`. Body: `ready:true`, `customerAgreed:true`, optional `startsAt` (explicit UTC ISO; omission starts now). Only a prepared, active workspace can activate. No tenant self-activation, reset, extension or plan change is exposed.

An activation retry with the same timestamp returns the existing dates without adding days or another audit event. A different timestamp after activation is rejected. Past starts beyond a one-minute request tolerance and starts over 90 days away are rejected. The activation update and its audit entry run in one batch with a conditional update, so competing activations cannot restart the clock. Administrative confirmations are assertions recorded in the audit, not an e-signature or proof that a customer actually agreed.

## Exact boundaries and enforcement

Dates are server-owned epoch milliseconds; duration is 30 × 24 hours followed by 14 × 24 hours, independent of browser clock or daylight-saving changes. The UI displays them in the profile timezone (UTC fallback).

| State | Interval | Operational access |
|---|---|---|
| PREPARED | Start not set | No state read/write; prepare profile and users through management API |
| SCHEDULED | Before start | Same as prepared |
| ACTIVE | Start inclusive to end exclusive | Existing authorized read/write |
| GRACE | End inclusive to read-until exclusive | Read/export only |
| EXPIRED | At/after read-until | Status and security revocation only |

Session and trial status remain available in all states. Disabling a non-CEO member or closing a scan session remains available for credential safety. At grace, state PUT, new users, profile changes, backups, document analysis, pairing creation and scan submission are blocked. An already-paired mobile device is checked against current server entitlement. State uploads are checked again after reading their request body. No periodic polling or cron job is required for expiry; access is evaluated on requests. Already downloaded data cannot be remotely withdrawn.

`GET /api/mrp/trial` exposes the authenticated company's status, dates and permissions. Session/state responses include trial metadata. There is no client-supplied clock or entitlement input.

## Customer UI

Active pilots see end and export deadline. At grace the app opens a dedicated read-only view with explicit authenticated actions to view saved data and download the full hydrated saved state as JSON. No initial-state write occurs in this view. Each view/download rechecks server access; an expired tab cannot keep fetching data. Trial denial does not send the user into a login loop. A denied save refreshes entitlement and opens the gate when needed. Unsaved local edits are not presented as saved exports.

The grace viewer is a JSON data viewer/export, not the full set of operational screens or a new Excel exporter. It is currently English. Expired users see contact, refresh and sign-out actions. No charge is initiated and no customer state is deleted at expiry. Separate retention/deletion terms still need to be agreed before collecting real customer data; this change is not an indefinite-retention promise.

## Evidence and remaining release gates

370 local Worker tests pass, including exact boundaries, prepared/scheduled access, admin authorization, consent requirements, activation retries, unchanged legacy accounts, grace direct-API rejection, previously paired phone rejection, state preservation and client manipulation attempts. Browser smoke runs in the PR workflow for grace view/export, denial after expiry, no writes, no login loop and an undismissable gate. Local browser execution is unavailable because the browser download failed; rely on recorded CI result, not an assumed local pass.

Before production: complete Cloudflare staging acceptance, reconcile mobile receipts PR #11 and verify every newly introduced operational route is behind the same entitlement gate. A migration failure is fail-closed; do not deploy the new Worker before the trial table exists. Rolling back to pre-trial code removes enforcement, so keep the enforcing Worker while rolling back unrelated UI changes.

Still separate: verified Paddle paid-conversion lifecycle, paid renewals/cancellation, invitation emails, full UI localization, single-site enforcement, and a company-level duplicate-trial/verification policy. A workspace gets only one clock, but an administrator can still create another workspace; this is not proof of one trial per legal company. Do not enable broad self-service signup or advertise paid conversion as working from this change alone.
