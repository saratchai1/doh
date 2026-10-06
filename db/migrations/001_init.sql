CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_units (
  code text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('route_team','owner_unit')),
  parent_code text REFERENCES org_units(code),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','MANAGER','STAFF','IH','VIEWER')),
  org_unit_code text REFERENCES org_units(code),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users ((lower(email)));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS work_order_numbers (
  year_be integer PRIMARY KEY,
  last_value integer NOT NULL
);

CREATE TABLE IF NOT EXISTS work_orders (
  id text PRIMARY KEY,
  reference_no text NOT NULL,
  source_agency text NOT NULL,
  subject text NOT NULL,
  location text NOT NULL,
  route_team text NOT NULL,
  owner_unit text NOT NULL,
  current_stage text NOT NULL,
  current_custodian text NOT NULL,
  created_by_user_id bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  official_due_at timestamptz,
  ih_due_at timestamptz,
  ih_round integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS work_orders_stage_idx ON work_orders(current_stage);
CREATE INDEX IF NOT EXISTS work_orders_custodian_idx ON work_orders(current_custodian);
CREATE INDEX IF NOT EXISTS work_orders_due_idx ON work_orders(official_due_at);
CREATE INDEX IF NOT EXISTS work_orders_created_idx ON work_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS difficulty_assessments (
  id bigserial PRIMARY KEY,
  work_order_id text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('INITIAL','IH')),
  level integer NOT NULL CHECK (level BETWEEN 1 AND 4),
  target_days integer NOT NULL,
  assessed_by_user_id bigint REFERENCES users(id),
  assessed_by_label text NOT NULL,
  reason text,
  assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS difficulty_assessments_work_order_idx ON difficulty_assessments(work_order_id, assessed_at);

CREATE TABLE IF NOT EXISTS workflow_events (
  id bigserial PRIMARY KEY,
  work_order_id text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  actor_user_id bigint REFERENCES users(id),
  actor_label text,
  from_custodian text,
  to_custodian text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_events_work_order_idx ON workflow_events(work_order_id, created_at, id);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES users(id),
  work_order_id text REFERENCES work_orders(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_work_order_idx ON audit_log(work_order_id, created_at DESC);

INSERT INTO org_units(code,name,kind,parent_code) VALUES
  ('RS.SB.1','รส.สบ.1','route_team',NULL),
  ('RS.SB.2','รส.สบ.2','route_team',NULL),
  ('RS.SB.3','รส.สบ.3','route_team',NULL),
  ('RS.SB.4','รส.สบ.4','route_team',NULL)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, active=true;

INSERT INTO org_units(code,name,kind,parent_code) VALUES
  ('WTB.1','วทบ.1','owner_unit','RS.SB.1'),
  ('WTB.2','วทบ.2','owner_unit','RS.SB.1'),
  ('WTB.3','วทบ.3','owner_unit','RS.SB.1'),
  ('WTB.4','วทบ.4','owner_unit','RS.SB.1'),
  ('WTB.5','วทบ.5','owner_unit','RS.SB.1'),
  ('WKB.1','วคบ.1','owner_unit','RS.SB.2'),
  ('WKB.2','วคบ.2','owner_unit','RS.SB.2'),
  ('WKB.3','วคบ.3','owner_unit','RS.SB.2'),
  ('WKB.4','วคบ.4','owner_unit','RS.SB.2'),
  ('PPB','ผปบ.','owner_unit','RS.SB.2'),
  ('WMB','วมบ.','owner_unit','RS.SB.3'),
  ('CHRB','ชรบ.','owner_unit','RS.SB.3'),
  ('OMB','อมบ.','owner_unit','RS.SB.3'),
  ('PTB','ผถบ.','owner_unit','RS.SB.4')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, parent_code=EXCLUDED.parent_code, active=true;
