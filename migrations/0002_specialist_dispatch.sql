-- v2: Active specialist technicians and supervised automatic dispatch.
-- Never create production staff identities or passwords through a public migration.
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  specialty TEXT NOT NULL CHECK(specialty IN (
    'Outage','Meter fault','Billing','Safety hazard','Voltage fluctuation','Transformer fault'
  )),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  max_open_cases INTEGER NOT NULL DEFAULT 12 CHECK(max_open_cases BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_staff_profiles_routing ON staff_profiles(specialty,active,max_open_cases);
CREATE INDEX IF NOT EXISTS ix_complaints_dispatch ON complaints(status,priority,created_at,assigned_to);
