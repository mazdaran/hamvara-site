CREATE TABLE IF NOT EXISTS oauth_connections (
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  expires_at TEXT,
  scopes TEXT,
  metadata TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS audit_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  target_url TEXT NOT NULL,
  strategy TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_workspace_created
ON audit_runs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mrp_workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mrp_users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  username TEXT NOT NULL,
  access_key_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OPERATOR', 'PRODUCTION_MANAGER', 'FACTORY_MANAGER', 'ACCOUNTING', 'CEO')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, username)
);

CREATE TABLE IF NOT EXISTS mrp_state (
  workspace_id TEXT PRIMARY KEY,
  state_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES mrp_users(id)
);

CREATE TABLE IF NOT EXISTS mrp_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES mrp_users(id)
);

CREATE INDEX IF NOT EXISTS idx_mrp_users_workspace_active
ON mrp_users(workspace_id, active);

CREATE INDEX IF NOT EXISTS idx_mrp_audit_workspace_created
ON mrp_audit_log(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mrp_state_backups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'SCHEDULED',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE', 'FAILED', 'LEGACY_UNVERIFIED')),
  artifact_count INTEGER NOT NULL DEFAULT 0 CHECK (artifact_count >= 0),
  completed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_created
ON mrp_state_backups(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_status_created
ON mrp_state_backups(workspace_id, status, created_at DESC);

PRAGMA optimize;
