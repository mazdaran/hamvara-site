CREATE TABLE IF NOT EXISTS mrp_audit_seals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'HMAC-SHA-256'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, run_id, signature),
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_audit_seals_workspace_run
  ON mrp_audit_seals(workspace_id, run_id, created_at DESC);
