# Deployment and rollback guide

1. Freeze the approved release commit and record its Git SHA.
2. Run the complete automated test suite.
3. Create a full data backup and perform a restore rehearsal in an isolated workspace.
4. Reconcile master-data counts, inventory value, open orders, WIP, and accounting balances.
5. Deploy only inside the approved Go-Live window and execute smoke tests for login, receipt, transfer, MRP, production posting, and reports.
6. Activate production only after the independent Go decision.
7. Start Hypercare immediately and retain monitoring evidence.

Rollback is mandatory when an approved critical threshold is exceeded. Stop new postings, preserve diagnostic evidence, restore the documented recovery point, reconcile affected transactions, and record the rollback authority and reason.
