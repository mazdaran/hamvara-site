-- Opt-in pilot: MRP_MOBILE_RECEIPT_WORKSPACES contains workspace slugs.
CREATE TABLE mrp_mobile_pairings (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES mrp_workspaces(id),
 user_id TEXT NOT NULL REFERENCES mrp_users(id), warehouse TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, claim_until INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 public_key TEXT, device_name TEXT, approved INTEGER NOT NULL DEFAULT 0,
 revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE mrp_mobile_nonces (
 pairing_id TEXT NOT NULL REFERENCES mrp_mobile_pairings(id), nonce TEXT NOT NULL,
 expires_at INTEGER NOT NULL, PRIMARY KEY(pairing_id, nonce)
);
CREATE INDEX mrp_mobile_nonce_expiry ON mrp_mobile_nonces(expires_at);
CREATE TABLE mrp_mobile_warehouse_grants (
 workspace_id TEXT NOT NULL REFERENCES mrp_workspaces(id), user_id TEXT NOT NULL REFERENCES mrp_users(id),
 warehouse TEXT NOT NULL, PRIMARY KEY(workspace_id,user_id,warehouse)
);
CREATE TABLE mrp_mobile_receipts (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES mrp_workspaces(id),
 submitted_by TEXT NOT NULL REFERENCES mrp_users(id), device_key_hash TEXT NOT NULL,
 client_event_id TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'SUBMITTED', version INTEGER NOT NULL DEFAULT 0,
 expected_state_revision INTEGER, transition_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id, submitted_by, client_event_id)
);
CREATE INDEX mrp_mobile_receipt_inbox ON mrp_mobile_receipts(workspace_id,created_at);
-- Every inventory transition uses a D1 batch. Abort and roll back the batch
-- if the state used to validate it has changed since it was read.
CREATE TRIGGER mrp_mobile_receipt_revision BEFORE UPDATE ON mrp_mobile_receipts
WHEN NEW.expected_state_revision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM mrp_state WHERE workspace_id=NEW.workspace_id AND revision=NEW.expected_state_revision
)
BEGIN SELECT RAISE(ABORT,'mobile_receipt_revision_conflict'); END;
