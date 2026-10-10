CREATE TABLE IF NOT EXISTS mrp_trials (
  workspace_id TEXT PRIMARY KEY REFERENCES mrp_workspaces(id) ON DELETE CASCADE,
  plan_version TEXT NOT NULL DEFAULT 'pilot-30d-v1',
  starts_at INTEGER,
  ends_at INTEGER,
  read_until INTEGER,
  activated_at INTEGER,
  CHECK ((starts_at IS NULL AND ends_at IS NULL AND read_until IS NULL AND activated_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND read_until IS NOT NULL AND ends_at=starts_at+2592000000 AND read_until=ends_at+1209600000 AND activated_at IS NOT NULL))
);
-- Explicitly enroll prepared pilots from the preceding provisioning release.
-- Unprofiled/ordinary workspaces are unaffected; no trial clock starts here.
INSERT OR IGNORE INTO mrp_trials (workspace_id)
SELECT workspace_id FROM mrp_workspace_profiles WHERE member_limit=3;
