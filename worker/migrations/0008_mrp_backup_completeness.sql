ALTER TABLE mrp_state_backups ADD COLUMN status TEXT NOT NULL DEFAULT 'LEGACY_UNVERIFIED'
  CHECK (status IN ('PENDING', 'COMPLETE', 'FAILED', 'LEGACY_UNVERIFIED'));

ALTER TABLE mrp_state_backups ADD COLUMN artifact_count INTEGER NOT NULL DEFAULT 0
  CHECK (artifact_count >= 0);

ALTER TABLE mrp_state_backups ADD COLUMN completed_at TEXT;

ALTER TABLE mrp_state_backups ADD COLUMN failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_status_created
  ON mrp_state_backups(workspace_id, status, created_at DESC);
