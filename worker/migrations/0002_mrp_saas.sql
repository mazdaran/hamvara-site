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

PRAGMA optimize;
