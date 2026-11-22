-- Cloudflare D1 schema. Roles are always verified server-side.
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 alias TEXT NOT NULL UNIQUE,
 pass_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('consumer','agent','admin')),
 area TEXT NOT NULL DEFAULT 'Enugu'
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 created TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS complaints (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reference TEXT NOT NULL UNIQUE,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 category TEXT NOT NULL,
 details TEXT NOT NULL,
 address TEXT NOT NULL,
 lat REAL,
 lon REAL,
 hazard INTEGER NOT NULL DEFAULT 0,
 affected INTEGER NOT NULL DEFAULT 1,
 priority TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'received',
 assigned_to INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 reviewed_at TEXT,
 assigned_at TEXT,
 started_at TEXT,
 resolved_at TEXT,
 closed_at TEXT,
 cycle INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER REFERENCES users(id),
 last_note TEXT,
 UNIQUE(owner_id, request_id)
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 complaint_id INTEGER NOT NULL REFERENCES complaints(id),
 actor_id INTEGER REFERENCES users(id),
 from_status TEXT,
 to_status TEXT NOT NULL,
 note TEXT,
 occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 complaint_id INTEGER NOT NULL REFERENCES complaints(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 cycle INTEGER NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment TEXT,
 submitted_at TEXT NOT NULL,
 UNIQUE(complaint_id,cycle)
);
CREATE TABLE IF NOT EXISTS uploads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 complaint_id INTEGER NOT NULL REFERENCES complaints(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 storage TEXT NOT NULL,
 uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_exp ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS ix_events_complaint ON events(complaint_id,id);
CREATE INDEX IF NOT EXISTS ix_complaints_owner ON complaints(owner_id);
CREATE INDEX IF NOT EXISTS ix_complaints_status ON complaints(status,priority);
CREATE INDEX IF NOT EXISTS ix_complaints_assigned ON complaints(assigned_to);
-- Centralized audit trail: every state change generates an event exactly once.
CREATE TRIGGER IF NOT EXISTS complaint_received AFTER INSERT ON complaints BEGIN
  INSERT INTO events(complaint_id,actor_id,from_status,to_status,note,occurred_at)
  VALUES(NEW.id,NEW.owner_id,NULL,'received','Complaint submitted',NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS complaint_status_changed AFTER UPDATE OF status ON complaints
WHEN NEW.status <> OLD.status
BEGIN
  INSERT INTO events(complaint_id,actor_id,from_status,to_status,note,occurred_at)
  VALUES(NEW.id,NEW.updated_by,OLD.status,NEW.status,NEW.last_note,NEW.updated_at);
END;
