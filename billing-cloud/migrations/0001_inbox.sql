CREATE TABLE IF NOT EXISTS billing_events (
 environment TEXT NOT NULL CHECK (environment = 'sandbox'),
 event_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 body_hash TEXT NOT NULL,
 payload TEXT NOT NULL,
 received_at INTEGER NOT NULL,
 processing_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(processing_status IN ('PENDING','PROCESSED','REVIEW')),
 PRIMARY KEY (environment,event_id)
);
CREATE INDEX IF NOT EXISTS billing_pending_events ON billing_events(processing_status,occurred_at,event_id);
