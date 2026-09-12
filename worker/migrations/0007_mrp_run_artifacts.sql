CREATE TABLE IF NOT EXISTS mrp_run_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  result_fingerprint TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  checkpoint_record_count INTEGER NOT NULL CHECK (checkpoint_record_count >= 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, run_id, result_fingerprint),
  FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_run_artifacts_workspace_created
  ON mrp_run_artifacts(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mrp_run_artifact_chunks (
  artifact_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  payload_base64 TEXT NOT NULL,
  PRIMARY KEY (artifact_id, chunk_index),
  FOREIGN KEY (artifact_id) REFERENCES mrp_run_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mrp_run_artifact_chunks_order
  ON mrp_run_artifact_chunks(artifact_id, chunk_index);
