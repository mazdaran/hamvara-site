# Pilot company access policy

Owner approved 2026-10-12: warehouse operator, operations manager (including quality), and CEO with finance. The same existing main dashboard and left navigation serve all roles. Unauthorized menu items stay visible but disabled. The server derives identity and role from the existing access key, projects permitted data, and rejects full-state replacement.

| Capability | Operator | Manager (production/factory) | CEO |
|---|---|---|---|
| Warehouse receipts, issues, transfers and counts | Prepare / submit | Review / approve | Review / oversight |
| Receipt quality | View status | Decide | Decide |
| Purchasing, suppliers, sales, customers, BOM and planning | Relevant warehouse data only | Maintain | Maintain |
| Journals, financial reports and period close | No | No | Full |
| Warehouse grants and company settings | No | No | Full |

Routine receipt approval posts stock in the same atomic transaction. The old APPROVED state remains recoverable by a manager or CEO. A submitter cannot approve their own document. Operational issue/production journal effects remain drafts for CEO review. Counts require manager review and independent CEO adjustment; a changed stock balance rejects stale counts. Lot/serial count variances require lot-level reconciliation instead of a blind quantity adjustment.

Activation is opt-in through MRP_ROLE_POLICY_WORKSPACES. Existing workspaces outside that list retain the previous flow. Run configure-pilot-roles.mjs in the existing Windows pilot checkout; apply its generated .pilot-staging/role-policy-grants.sql through the existing pilot Wrangler configuration; then deploy that configuration. The helper copies assets while preserving the generated API base and billing bindings. It never seeds stock, rotates keys, resets a subscription, or provisions customers.

Validation: role-access.test.mjs exercises server authorization, warehouse scoping, independent approval, financial draft posting, stale count protection, atomic audit and cross-company isolation. shared-dashboard-ui.cjs runs the actual main page for all operational roles. Legacy receipt tests run with the new policy disabled.
