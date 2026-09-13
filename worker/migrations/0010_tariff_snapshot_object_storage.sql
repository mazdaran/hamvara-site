ALTER TABLE tariff_sync_runs ADD COLUMN snapshot_prefix TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN base_snapshot_prefix TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN snapshot_manifest_key TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN snapshot_sha256 TEXT;

CREATE TABLE IF NOT EXISTS tariff_snapshot_chapters (
  run_id TEXT NOT NULL,
  chapter INTEGER NOT NULL CHECK (chapter BETWEEN 1 AND 97),
  object_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  stored_at TEXT NOT NULL,
  PRIMARY KEY (run_id, chapter),
  FOREIGN KEY (run_id) REFERENCES tariff_sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tariff_snapshot_chapters_run
  ON tariff_snapshot_chapters(run_id, chapter);

CREATE INDEX IF NOT EXISTS idx_tariff_sync_runs_snapshot
  ON tariff_sync_runs(completed_at DESC)
  WHERE snapshot_manifest_key IS NOT NULL;

PRAGMA optimize;
