PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sku','mrp')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, name TEXT NOT NULL, billing_owner TEXT NOT NULL REFERENCES users(id), site_id TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id), PRIMARY KEY(user_id,company_id));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), owner_id TEXT NOT NULL, plan TEXT NOT NULL, request_key TEXT NOT NULL, transaction_id TEXT UNIQUE, state TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,request_key));
CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, body_hash TEXT NOT NULL, payload TEXT NOT NULL, received_at INTEGER NOT NULL);
