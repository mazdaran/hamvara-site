ALTER TABLE tariff_sync_runs ADD COLUMN progress_current INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tariff_sync_runs ADD COLUMN progress_total INTEGER NOT NULL DEFAULT 97;
ALTER TABLE tariff_sync_runs ADD COLUMN heartbeat_at TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN lease_token TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tariff_sync_runs_active
  ON tariff_sync_runs(status, heartbeat_at DESC);

PRAGMA optimize;
