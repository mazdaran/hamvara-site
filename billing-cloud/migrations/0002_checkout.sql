CREATE TABLE billing_users(id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE billing_companies(id TEXT PRIMARY KEY, name TEXT NOT NULL, billing_owner TEXT NOT NULL REFERENCES billing_users(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE billing_memberships(user_id TEXT NOT NULL REFERENCES billing_users(id), company_id TEXT NOT NULL REFERENCES billing_companies(id), PRIMARY KEY(user_id,company_id));
CREATE TABLE billing_keys(key_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES billing_users(id), expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)));
CREATE TABLE billing_intents(
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES billing_users(id), owner_id TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('user','company')), product TEXT NOT NULL, plan TEXT NOT NULL,
 request_key TEXT NOT NULL, transaction_id TEXT UNIQUE, state TEXT NOT NULL CHECK(state IN ('creating','review','ready')),
 created_at INTEGER NOT NULL, UNIQUE(user_id,request_key), UNIQUE(scope,owner_id,product)
);
-- One checkout per owner/product in this sandbox pilot. Uncertain purchases require review,
-- never an automatic second charge. Upgrades and a replacement checkout are not enabled yet.
