PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tariff_sync_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_revision TEXT,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','STAGED','PROMOTED','REJECTED','FAILED')),
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_added INTEGER NOT NULL DEFAULT 0,
  rows_changed INTEGER NOT NULL DEFAULT 0,
  rows_removed INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  promoted_at TEXT,
  promoted_by TEXT,
  decision_reason TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS tariff_hts_lines (
  hts10 TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  general_rate_raw TEXT,
  special_rate_raw TEXT,
  units_json TEXT NOT NULL DEFAULT '[]',
  source_revision TEXT,
  content_hash TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  recorded_at TEXT NOT NULL,
  superseded_at TEXT
);

CREATE TABLE IF NOT EXISTS tariff_hts_stage (
  run_id TEXT NOT NULL,
  hts10 TEXT NOT NULL,
  description TEXT NOT NULL,
  general_rate_raw TEXT,
  special_rate_raw TEXT,
  units_json TEXT NOT NULL DEFAULT '[]',
  source_revision TEXT,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (run_id, hts10),
  FOREIGN KEY (run_id) REFERENCES tariff_sync_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tariff_hts_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  hts10 TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('ADDED','CHANGED','REMOVED')),
  old_value_json TEXT,
  new_value_json TEXT,
  detected_at TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'PENDING' CHECK (disposition IN ('PENDING','ACCEPTED','REJECTED','NO_IMPACT')),
  disposition_at TEXT,
  disposition_by TEXT,
  disposition_reason TEXT,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  FOREIGN KEY (run_id) REFERENCES tariff_sync_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tariff_rule_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VERIFIED','PUBLISHED','RETIRED')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  source_revision TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  published_by TEXT,
  published_at TEXT,
  supersedes_id TEXT,
  content_hash TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (supersedes_id) REFERENCES tariff_rule_sets(id)
);

CREATE TABLE IF NOT EXISTS tariff_rules (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  hts_pattern TEXT,
  country_group_json TEXT NOT NULL DEFAULT '[]',
  rate_pct REAL,
  specific_rate_json TEXT,
  cap_rule_json TEXT,
  deminimis_rule_json TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  source_url TEXT NOT NULL,
  source_sha256 TEXT,
  source_status TEXT NOT NULL DEFAULT 'PRIMARY_PENDING' CHECK (source_status IN ('PRIMARY_PENDING','PRIMARY_VERIFIED','BROKER_REVIEWED')),
  FOREIGN KEY (rule_set_id) REFERENCES tariff_rule_sets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tariff_rule_relations (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  left_program_id TEXT NOT NULL,
  right_program_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('STACKS_WITH','EXCLUDED_BY','EXCLUSIVE_WITH','CAPPED_WITH','REQUIRES_REVIEW','SUPERSEDES')),
  priority INTEGER NOT NULL DEFAULT 0,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  source_url TEXT NOT NULL,
  source_status TEXT NOT NULL DEFAULT 'PRIMARY_PENDING' CHECK (source_status IN ('PRIMARY_PENDING','PRIMARY_VERIFIED','BROKER_REVIEWED')),
  FOREIGN KEY (rule_set_id) REFERENCES tariff_rule_sets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tariff_fee_schedules (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  fee_id TEXT NOT NULL,
  fiscal_year INTEGER,
  rate_pct REAL NOT NULL,
  minimum_usd REAL,
  maximum_usd REAL,
  transport_mode TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  source_url TEXT NOT NULL,
  source_status TEXT NOT NULL DEFAULT 'PRIMARY_PENDING' CHECK (source_status IN ('PRIMARY_PENDING','PRIMARY_VERIFIED','BROKER_REVIEWED')),
  FOREIGN KEY (rule_set_id) REFERENCES tariff_rule_sets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tariff_rule_reviews (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED','SOURCE_REVIEWED','VERIFIED','PUBLISHED','RETIRED','REJECTED')),
  actor TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (rule_set_id) REFERENCES tariff_rule_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tariff_sync_runs_started ON tariff_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tariff_stage_run ON tariff_hts_stage(run_id, hts10);
CREATE INDEX IF NOT EXISTS idx_tariff_changes_run_type ON tariff_hts_changes(run_id, change_type);
CREATE INDEX IF NOT EXISTS idx_tariff_changes_unacknowledged ON tariff_hts_changes(detected_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tariff_changes_disposition ON tariff_hts_changes(run_id, disposition, change_type, id);
CREATE INDEX IF NOT EXISTS idx_tariff_rule_sets_status_effective ON tariff_rule_sets(status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_tariff_rules_lookup ON tariff_rules(rule_set_id, program_id, hts_pattern, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_tariff_relations_lookup ON tariff_rule_relations(rule_set_id, left_program_id, right_program_id);
CREATE INDEX IF NOT EXISTS idx_tariff_fees_lookup ON tariff_fee_schedules(rule_set_id, fee_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_tariff_reviews_set_time ON tariff_rule_reviews(rule_set_id, created_at DESC);

PRAGMA optimize;
