CREATE TABLE IF NOT EXISTS mrp_state_backups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_created
ON mrp_state_backups(workspace_id, created_at DESC);

PRAGMA optimize;
