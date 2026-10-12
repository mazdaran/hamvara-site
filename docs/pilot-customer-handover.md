# Pilot customer handover — 12 October 2026

## Current boundary

`pilot-tr` and `pilot-us` on `hamvara-pilot-staging` are internal synthetic test companies. Their generic owner/operator/manager users and shared test data are NOT customer accounts. Their billing is tied to Paddle sandbox test companies. Do not give these combined internal access files to prospects or enter real customer operational data into these workspaces.

Receipt desktop and phone acceptance has been completed manually, including independent review and posting. Persian/Arabic quantity entry has been confirmed by the owner. Physical USB scanner acceptance remains deferred until hardware is available. These observations are not a complete product or security certification.

## Verify and export existing internal accounts

From the pilot checkout root run:

    node worker/scripts/export-pilot-readiness.mjs

This uses the existing `.pilot-staging/credentials.json`. It refuses other database IDs, uses only the fixed pilot origin and read-only GET requests, verifies staging health before sending any key, then checks all six identities and cross-company credential denial. It reads receipt warehouse access, profiles, member limits and trial/subscription status. A missing MRP subscription is reported as a blocker, not silently activated or bypassed. Identity or isolation failures abort export.

A new private directory `.pilot-staging/readiness-<random>/` contains:

- `readiness-report.json`: no access keys or administrator token; can be shared for diagnosis.
- `pilot-tr-access.txt`: existing Turkish internal test user keys and roles, with access blockers.
- `pilot-us-access.txt`: existing US internal test user keys and roles, with access blockers.

The directory is already git-ignored. Keys are never regenerated, printed to the terminal or sent to another origin. On Windows files inherit the local directory permissions: keep this directory in your own Windows account. The combined TXT files are for the administrator only; future customer users should each receive only their own credential. No email or message is sent.

`internalOperationalReady` covers login, three matched active users and receipt warehouse access only. `customerReady` remains false for both internal companies even if all tests pass. Trial dates and sandbox expiry are reported without changing them.

## Real customer intake and rollout

`pilot-customer-capacity.csv` is a 20-slot planning register, not a tenant list and not proof that companies have agreed. Start with up to three assisted onboardings, then expand based on support capacity. Fill slots only with actual approved customer details. Never store access keys in the register or commit completed private customer details to the repository.

For the first company collect:

1. Actual company name and a unique workspace slug.
2. Country, communication language, actual IANA timezone, operating currency and contact email. For US customers confirm timezone explicitly; do not assume New York.
3. Three named people, usernames and roles. A practical receipt pilot uses CEO, production manager and operator: operator submits, manager performs receive/QC, and CEO performs manager approval and posting. Nobody reviews their own submitted receipt.
4. Agreed pilot scope, onboarding appointment and readiness acceptance. Activation starts only after readiness and explicit agreement; do not backdate or restart existing clocks.

Before provisioning a customer, release and validate the needed tenant/profile/trial/receipt migrations and code on the intended customer environment. Main has deployment hardening, but the complete pilot integration stack is not thereby promoted to production. Do not point customer creation at the sandbox test workspaces.

Provision each company separately with the existing workspace tool, create its own named users, configure warehouse grants and securely deliver each key privately. Prepared provisioning must not activate the trial. After sample acceptance, agree a 30-day start; the server supports 14 subsequent days of read/export grace. Actual paid conversion requires live billing integration; sandbox success is not a live subscription.

## Per-customer acceptance before real operational use

Record who verified each item and its date: correct profile/currency; three-user roles and isolation; product master and opening-stock import; goods receipt and independent approval; BOM shortage calculation and a production order; export and backup/recovery; trial/grace boundaries; support contact and handover. Do not reset internal or customer data as part of the readiness report. Any reset is a separate explicit operation.

## Immediate next step

Run the read-only report in the existing Windows pilot checkout and resolve its specific blockers. In the last recorded internal billing test, US had sandbox MRP entitlement while TR had only SKU Bridge entitlement. Recheck current status before deciding how to enable the Turkish MRP test; do not bypass subscription enforcement or activate a customer clock to hide a sandbox test condition.
