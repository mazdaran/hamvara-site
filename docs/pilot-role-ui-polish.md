# Pilot role UI polish (after role activation)

Base: `codex/pilot-staging-integration` at `5229a4020219d5028fecb9216b68130e3e10c756`.

## Changes

1. Pending receipts are read from a new authenticated, read-only receipt-console summary. One scoped SQL snapshot counts the complete inbox plus legacy receipts, excludes POSTED/REJECTED, and avoids double-counting linked MOB receipts. Counts are not capped by the inbox display's latest-100 limit. Held receipts remain pending. Missing/failed summaries display Unavailable rather than a fabricated zero.
2. Non-CEO inventory valuation cards retain a muted title with no visible value or Restricted placeholder. The operator's quality card and non-CEO financial-documents card use the same presentation. An accessible disabled state remains explicit; authorized values (including real zero) stay visible. Server redaction and role permissions are unchanged, and costs are not loaded into restricted browsers.
3. The duplicate legacy receipt-pilot link is removed only while role policy is enabled. Computer/mobile/USB entry links and legacy unflagged workspaces remain intact.
4. Disabled native file inputs remain disabled; their visible label-buttons now mirror this with disabled styling, aria-disabled and a blocked label click. No role is granted restore/import access.
5. Role identity and connection text have explicit readable foreground colours.
6. The header uses a responsive identity row and a separate tools row. Tool labels do not wrap mid-label. ResizeObserver keeps the sticky menu offset/available height in sync with the real header height. Sidebar bottom-scroll room is retained.

The new summary refreshes on dashboard rendering/navigation and explicit Refresh. There is no timer, background polling, automatic retry, or added dependency. Temporary summary failures remain visible as Unavailable, wrapping within the card; they are not treated as role-disabled metrics.

## Verification

- `node --test worker/test/receipt-summary.test.mjs`: actual SQLite SELECT tests covering >100 pending receipts, terminal states, linked and orphan legacy rows, cross-tenant/user warehouse isolation, QA visibility, invalid actors, read-only operation and unavailable responses.
- `worker/test/shared-dashboard-ui.cjs`: existing full-application role/navigation/mutation tests retained; added summary success/error/zero/no-idle-poll checks, disabled labels, duplicate-link removal, quiet denied metrics (including after rerender), accessible disabled state, authorized values, and header geometry at effective CSS viewports corresponding to 100/110/125% on 1920px and 1366px desktops for all four internal role identifiers.
- A local offline Chromium fixture verifies the presentation module with the existing header markup; full-application coverage is in the GitHub browser job. Effective CSS viewport checks are not a substitute for final manual Windows/Edge zoom checks.

## Release boundary

This PR does not deploy. It does not change role policy, warehouse grants, authentication, credentials, billing bindings, subscription state, Wrangler configuration, DB schema, seed data or stock/financial posting workflows. The server change adds only a GET summary route under the existing authenticated and subscription-enforced receipt console.

Review/merge this PR before any deployment. Refresh pilot assets only through the existing configure-pilot-roles helper when approved; do NOT run prepare-pilot-staging.mjs. Preserve `.pilot-staging/wrangler.json`, all existing keys, billing connection and data. Deploy only with separate owner approval, then re-run six-account API access checks and verify the header in Edge at 100%, 110%, 125%. Confirm Pending receipts reflects the remaining submitted test receipts; do not approve historical receipts as part of UI checking.
