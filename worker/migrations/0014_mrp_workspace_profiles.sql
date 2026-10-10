-- Additive only: existing workspaces and operational data are unchanged.
CREATE TABLE IF NOT EXISTS mrp_workspace_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES mrp_workspaces(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('en','tr','fa')),
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  member_limit INTEGER CHECK(member_limit IS NULL OR member_limit >= 1),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
