PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tariff_promotion_gate (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  opened_at TEXT,
  opened_until TEXT,
  opened_by TEXT,
  open_reason TEXT,
  closed_at TEXT,
  closed_by TEXT,
  close_reason TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tariff_promotion_gate (singleton,status,updated_at)
VALUES (1,'CLOSED',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE IF NOT EXISTS tariff_promotion_gate_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('OPENED','CLOSED')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  opened_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS tariff_promotion_gate_events_no_update
BEFORE UPDATE ON tariff_promotion_gate_events
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion gate events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_gate_events_no_delete
BEFORE DELETE ON tariff_promotion_gate_events
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion gate events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_window_insert_guard
BEFORE INSERT ON tariff_promotion_batches
WHEN NEW.status = 'PROMOTED' AND NOT EXISTS (
  SELECT 1 FROM tariff_promotion_gate
  WHERE singleton = 1
    AND status = 'OPEN'
    AND opened_until > NEW.promoted_at
)
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion window is closed or expired');
END;

CREATE TRIGGER IF NOT EXISTS tariff_promotion_window_rollback_guard
BEFORE UPDATE OF status ON tariff_promotion_batches
WHEN OLD.status = 'PROMOTED'
  AND NEW.status = 'ROLLED_BACK'
  AND NOT EXISTS (
    SELECT 1 FROM tariff_promotion_gate
    WHERE singleton = 1
      AND status = 'OPEN'
      AND opened_until > COALESCE(NEW.rolled_back_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )
BEGIN
  SELECT RAISE(ABORT, 'tariff promotion window is closed or expired');
END;

CREATE INDEX IF NOT EXISTS idx_tariff_promotion_gate_events_created
  ON tariff_promotion_gate_events(created_at DESC);

PRAGMA optimize;
