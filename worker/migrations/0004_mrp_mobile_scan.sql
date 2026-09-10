CREATE TABLE IF NOT EXISTS mrp_scan_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  terminal_user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_scan_sessions_workspace ON mrp_scan_sessions(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mrp_scan_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  raw_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES mrp_scan_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_mrp_scan_events_session_sequence ON mrp_scan_events(session_id, sequence);
