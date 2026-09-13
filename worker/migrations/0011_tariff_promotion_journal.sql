PRAGMA foreign_keys = ON;

ALTER TABLE tariff_sync_runs ADD COLUMN base_overlay_key TEXT;
ALTER TABLE tariff_sync_runs ADD COLUMN base_overlay_sha256 TEXT;

CREATE TABLE IF NOT EXISTS tariff_promotion_batches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('BASELINE_ACTIVATION','DELTA_ONLY')),
  status TEXT NOT NULL CHECK (status IN ('PROMOTED','ROLLED_BACK')),
  previous_batch_id TEXT,
  base_snapshot_prefix TEXT NOT NULL,
  base_manifest_key TEXT NOT NULL,
  base_snapshot_sha256 TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  previous_artifact_key TEXT,
  previous_artifact_sha256 TEXT,
  applied_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  no_impact_count INTEGER NOT NULL DEFAULT 0,
  promoted_at TEXT NOT NULL,
  promoted_by TEXT NOT NULL,
  promotion_reason TEXT NOT NULL,
  rolled_back_at TEXT,
  rolled_back_by TEXT,
  rollback_reason TEXT,
  FOREIGN KEY (run_id) REFERENCES tariff_sync_runs(id),
  FOREIGN KEY (previous_batch_id) REFERENCES tariff_promotion_batches(id)
);

CREATE TABLE IF NOT EXISTS tariff_production_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  base_run_id TEXT NOT NULL,
  base_snapshot_prefix TEXT NOT NULL,
  base_manifest_key TEXT NOT NULL,
  base_snapshot_sha256 TEXT NOT NULL,
  head_batch_id TEXT NOT NULL,
  overlay_artifact_key TEXT NOT NULL,
  overlay_artifact_sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (base_run_id) REFERENCES tariff_sync_runs(id),
  FOREIGN KEY (head_batch_id) REFERENCES tariff_promotion_batches(id)
);

CREATE TABLE IF NOT EXISTS tariff_promotion_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('PROMOTED','ROLLED_BACK')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES tariff_promotion_batches(id),
  FOREIGN KEY (run_id) REFERENCES tariff_sync_runs(id)
);

CREATE TRIGGER IF NOT EXISTS tariff_promotion_head_guard
BEFORE INSERT ON tariff_promotion_batches
WHEN NEW.status = 'PROMOTED' AND (
  (NEW.previous_batch_id IS NULL AND EXISTS (
    SELECT 1 FROM tariff_production_state WHERE singleton = 1
  )) OR
  (NEW.previous_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tariff_production_state
    WHERE singleton = 1 AND head_batch_id = NEW.previous_batch_id
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'tariff production head changed');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_review_guard
BEFORE INSERT ON tariff_promotion_batches
WHEN NEW.status = 'PROMOTED' AND (
  NOT EXISTS (
    SELECT 1 FROM tariff_sync_runs
    WHERE id = NEW.run_id AND status = 'STAGED'
  ) OR
  (NEW.mode = 'BASELINE_ACTIVATION' AND NOT EXISTS (
    SELECT 1 FROM tariff_sync_runs
    WHERE id = NEW.run_id AND snapshot_prefix = NEW.base_snapshot_prefix
  )) OR
  (NEW.mode = 'DELTA_ONLY' AND NOT EXISTS (
    SELECT 1
    FROM tariff_production_state state
    JOIN tariff_sync_runs run ON run.id = NEW.run_id
    WHERE state.singleton = 1
      AND state.head_batch_id = NEW.previous_batch_id
      AND state.base_snapshot_prefix = NEW.base_snapshot_prefix
      AND state.overlay_artifact_key = NEW.previous_artifact_key
      AND state.overlay_artifact_sha256 = NEW.previous_artifact_sha256
      AND run.base_snapshot_prefix = state.base_snapshot_prefix
      AND run.base_overlay_key = state.overlay_artifact_key
      AND run.base_overlay_sha256 = state.overlay_artifact_sha256
  )) OR
  EXISTS (
    SELECT 1 FROM tariff_hts_changes
    WHERE run_id = NEW.run_id AND (
      disposition = 'PENDING'
      OR acknowledged_at IS NULL
      OR acknowledged_by IS NULL
      OR disposition_at IS NULL
      OR disposition_by IS NULL
      OR disposition_reason IS NULL
      OR trim(disposition_reason) = ''
      OR disposition_by = NEW.promoted_by
      OR acknowledged_by = NEW.promoted_by
    )
  ) OR
  NEW.applied_count <> (
    SELECT COUNT(*) FROM tariff_hts_changes
    WHERE run_id = NEW.run_id AND disposition IN ('ACCEPTED','NO_IMPACT')
  ) OR
  NEW.accepted_count <> (
    SELECT COUNT(*) FROM tariff_hts_changes
    WHERE run_id = NEW.run_id AND disposition = 'ACCEPTED'
  ) OR
  NEW.no_impact_count <> (
    SELECT COUNT(*) FROM tariff_hts_changes
    WHERE run_id = NEW.run_id AND disposition = 'NO_IMPACT'
  ) OR
  (NEW.mode = 'BASELINE_ACTIVATION' AND EXISTS (
    SELECT 1 FROM tariff_hts_changes WHERE run_id = NEW.run_id
  )) OR
  (NEW.mode = 'DELTA_ONLY' AND NOT EXISTS (
    SELECT 1 FROM tariff_production_state WHERE singleton = 1
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion review gate changed');
END;

CREATE TRIGGER IF NOT EXISTS tariff_rollback_head_guard
BEFORE UPDATE OF status ON tariff_promotion_batches
WHEN OLD.status = 'PROMOTED' AND NEW.status = 'ROLLED_BACK' AND NOT EXISTS (
  SELECT 1 FROM tariff_production_state
  WHERE singleton = 1 AND head_batch_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'only the production head can be rolled back');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_events_no_update
BEFORE UPDATE ON tariff_promotion_events
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_events_no_delete
BEFORE DELETE ON tariff_promotion_events
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion events are immutable');
END;

CREATE INDEX IF NOT EXISTS idx_tariff_promotion_batches_run
  ON tariff_promotion_batches(run_id, promoted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tariff_promotion_events_batch
  ON tariff_promotion_events(batch_id, created_at DESC);

PRAGMA optimize;
