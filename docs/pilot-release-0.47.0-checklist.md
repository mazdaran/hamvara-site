# Hamvara MRP 0.47.0 — release provenance and acceptance gate

**Status:** Review-only preparation for the existing isolated TR/US pilot. This document does not approve a production merge, rollout, migration or customer activation. Tracking: [Release gate #32](https://github.com/mazdaran/hamvara-site/issues/32).

## Source proof (safe and read-only)

Run in a **clean checkout of the exact reviewed commit** after this release-proof PR is integrated into `codex/pilot-staging-integration`. Node.js 22 and Git are sufficient:

```powershell
node worker/scripts/pilot-release-manifest.mjs --write artifacts/pilot-release/manifest.json
node worker/scripts/pilot-release-manifest.mjs --verify artifacts/pilot-release/manifest.json
```

Both commands refuse a dirty tracked tree, a mismatch from displayed MRP version `0.47.0`, or missing receipt/role/trial source and D1 migration files (`0013`–`0015`). The deterministic manifest binds the Git SHA to SHA-256 hashes of **tracked MRP web assets, Worker source, the migration files and the pilot preparation scripts**; it reads no staging secrets or customer data. The generated `artifacts/pilot-release/manifest.json` is a public source fingerprint, **not** a secret, signature, proof of customer acceptance or evidence that Cloudflare has deployed that SHA.

Do not edit tracked release files after generating the manifest; verify it again before tagging. The GitHub Actions workflow `Pilot release fingerprint (no deployment)` creates and re-verifies the same artifact without Cloudflare credentials.

## Remote acceptance (separate from this artifact)

1. Inspect **Cloudflare staging only**: Worker `hamvara-pilot-staging`, D1 `hamvara-pilot-staging` (the existing internal D1 ends `...29ae8`), active deployment ID, traffic allocation and `/health`. A Cloudflare Worker deployment version UUID is not a Git commit hash; record both and confirm the deployed assets by an independent smoke test. Never substitute the billing sandbox or production D1.
2. Preserve the current `.pilot-staging/` credentials, billing service binding, roles, keys, trial start times and all existing posted receipts. **Do not rerun `prepare-pilot-staging.mjs`, reseed the database or rotate credentials** on the running pilot just to update assets. Any newly approved staging deployment must follow the existing reviewed `configure-pilot-roles.mjs` procedure and a manual rollback plan.
3. On the operator's existing Windows staging checkout, run `node worker/scripts/export-pilot-readiness.mjs` and inspect only the resulting `readiness-report.json`. It checks all six internal users and cross-company denial, without resetting data or printing keys. Keep `credentials.json` and `*-access.txt` private. Check that TR and US have the **MRP** sandbox entitlement, not only SKU Bridge.
4. Record actual TR **and US** receipt operations with distinct authorized users, pending count, quarantine/QC/manager/CEO, resulting stock and audit. Then exercise iPhone Safari on a physical device and Android QR/camera/Keystore/offline retry/revocation; note the physical USB test remains hardware-dependent.
5. Independently review #31 CodeQL alert closure and browser regression checks, and verify billing entitlements, 30-day trial plus 14-day read/export grace, backup/restore, schema state and transaction integrity in isolated staging. Avoid all production migrations at this stage.

## Tag, rollback and release decision

- **Do not create `v0.47.0` now**. When owner sign-off, security, staging evidence and browser/phone checks all pass, tag the exact approved source commit and attach its final manifest. Do not assume that displaying `Version 0.47.0` proves a reviewed release.
- Keep a known-good Worker deployment identifier, prior static-asset bundle and a tested restore procedure. **Migrations 0013–0015 and already-posted stock should not be blindly reversed**: restoring pre-trial Worker code may remove entitlement enforcement. Roll back only compatible code with explicit safeguards and retain the newer enforcing API when necessary.
- Separate real customer onboarding and live Paddle paid conversion from internal synthetic tenants and sandbox testing. Never advertise a paid or production feature solely because local checks pass.

**No Cloudflare token, administrator key, login credential or customer data belongs in a public manifest, CI log, issue or PR.**
