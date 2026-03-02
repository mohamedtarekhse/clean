-- ═══════════════════════════════════════════════════════════════════════════════
--  Asset Management System — Supabase Database Schema
--  Run in Supabase SQL Editor → "Run"  (or: supabase db push)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────────────────────
--  ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE asset_status    AS ENUM ('Active','Inactive','Maintenance','Retired','Contracted','Standby');
  CREATE TYPE rig_status      AS ENUM ('Active','Inactive','Maintenance','Standby');
  CREATE TYPE contract_status AS ENUM ('Active','Expired','Pending','Terminated');
  CREATE TYPE transfer_status AS ENUM ('Pending','Ops Approved','Completed','Rejected','On Hold');
  CREATE TYPE maint_priority  AS ENUM ('Critical','High','Normal','Low');
  CREATE TYPE bom_item_type   AS ENUM ('Serialized','Bulk');
  CREATE TYPE bom_item_status AS ENUM ('Active','Inactive','Obsolete','On Order','Maintenance');
  CREATE TYPE user_role       AS ENUM ('Admin','Asset Manager','Editor','Viewer');
  CREATE TYPE notif_kind      AS ENUM ('info','success','warning','error');
  CREATE TYPE approval_action AS ENUM ('approve','reject','hold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. COMPANIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'Drilling Contractor',
  country     TEXT,
  contact     TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RIGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rigs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT,
  company     TEXT REFERENCES companies(name) ON UPDATE CASCADE,
  location    TEXT,
  depth       TEXT,
  hp          INTEGER,
  status      rig_status NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  3. CONTRACTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id          TEXT PRIMARY KEY,
  company     TEXT REFERENCES companies(name) ON UPDATE CASCADE,
  rig         TEXT,
  value       NUMERIC(15,2) DEFAULT 0,
  start_date  DATE,
  end_date    DATE,
  status      contract_status NOT NULL DEFAULT 'Pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  4. ASSETS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  asset_id          TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'Other',
  company           TEXT REFERENCES companies(name) ON UPDATE CASCADE,
  rig_name          TEXT REFERENCES rigs(name) ON UPDATE CASCADE,
  location          TEXT,
  status            asset_status NOT NULL DEFAULT 'Active',
  value             NUMERIC(15,2) DEFAULT 0,
  acquisition_date  DATE,
  serial            TEXT,
  notes             TEXT,
  last_inspection   DATE,
  inspection_type   TEXT,
  cert_link         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_name_trgm   ON assets USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS assets_status_idx  ON assets(status);
CREATE INDEX IF NOT EXISTS assets_company_idx ON assets(company);
CREATE INDEX IF NOT EXISTS assets_rig_idx     ON assets(rig_name);

-- ─────────────────────────────────────────────────────────────────────────────
--  5. CONTRACT ↔ ASSET JUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_assets (
  contract_id  TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  asset_id     TEXT REFERENCES assets(asset_id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, asset_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  6. BOM ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_items (
  id            TEXT PRIMARY KEY,
  asset_id      TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES bom_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  part_no       TEXT,
  type          bom_item_type NOT NULL DEFAULT 'Serialized',
  serial        TEXT,
  manufacturer  TEXT,
  qty           NUMERIC(10,3) DEFAULT 1,
  uom           TEXT DEFAULT 'EA',
  unit_cost     NUMERIC(15,2) DEFAULT 0,
  lead_time     INTEGER DEFAULT 0,
  status        bom_item_status NOT NULL DEFAULT 'Active',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bom_asset_idx  ON bom_items(asset_id);
CREATE INDEX IF NOT EXISTS bom_parent_idx ON bom_items(parent_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  7. CERTIFICATES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  cert_id          TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  inspection_type  TEXT NOT NULL,
  last_inspection  DATE,
  next_inspection  DATE,
  validity_days    INTEGER DEFAULT 365,
  alert_days       INTEGER DEFAULT 30,
  cert_link        TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certs_asset_idx ON certificates(asset_id);
CREATE INDEX IF NOT EXISTS certs_next_idx  ON certificates(next_inspection);

-- ─────────────────────────────────────────────────────────────────────────────
--  8. MAINTENANCE SCHEDULES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  task        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Inspection',
  priority    maint_priority NOT NULL DEFAULT 'Normal',
  freq        INTEGER NOT NULL DEFAULT 90,
  last_done   DATE,
  next_due    DATE NOT NULL,
  tech        TEXT,
  hours       NUMERIC(6,2),
  cost        NUMERIC(12,2),
  status      TEXT NOT NULL DEFAULT 'Scheduled',
  alert_days  INTEGER DEFAULT 14,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maint_asset_idx    ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS maint_next_due_idx ON maintenance_schedules(next_due);

-- ─────────────────────────────────────────────────────────────────────────────
--  9. MAINTENANCE LOGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id      TEXT NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  completion_date  DATE NOT NULL,
  performed_by     TEXT NOT NULL,
  hours            NUMERIC(6,2),
  cost             NUMERIC(12,2),
  parts_used       TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS logs_schedule_idx ON maintenance_logs(schedule_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  10. TRANSFERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
  id                TEXT PRIMARY KEY,
  asset_id          TEXT NOT NULL REFERENCES assets(asset_id),
  asset_name        TEXT,
  current_loc       TEXT,
  destination       TEXT NOT NULL,
  dest_rig          TEXT,
  dest_company      TEXT,
  priority          maint_priority NOT NULL DEFAULT 'Normal',
  type              TEXT NOT NULL DEFAULT 'Field to Field',
  requested_by      TEXT,
  request_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  reason            TEXT,
  instructions      TEXT,
  status            transfer_status NOT NULL DEFAULT 'Pending',
  ops_approved_by   TEXT,
  ops_approved_date DATE,
  ops_action        approval_action,
  ops_comment       TEXT,
  mgr_approved_by   TEXT,
  mgr_approved_date DATE,
  mgr_action        approval_action,
  mgr_comment       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transfers_asset_idx  ON transfers(asset_id);
CREATE INDEX IF NOT EXISTS transfers_status_idx ON transfers(status);

-- ─────────────────────────────────────────────────────────────────────────────
--  11. APP USERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'Viewer',
  dept        TEXT,
  email       TEXT UNIQUE NOT NULL,
  color       TEXT DEFAULT '#0070F2',
  initials    TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  12. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  icon        TEXT DEFAULT 'fas fa-info-circle',
  kind        notif_kind NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  description TEXT,
  time_label  TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notif_read_idx ON notifications(is_read);

-- ─────────────────────────────────────────────────────────────────────────────
--  13. AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  changed_by   TEXT,
  old_data     JSONB,
  new_data     JSONB,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','rigs','contracts','assets','bom_items',
    'certificates','maintenance_schedules','transfers','app_users'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  VIEW: maintenance with computed live status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_maintenance AS
SELECT
  ms.*,
  a.name        AS asset_name,
  a.rig_name,
  a.company,
  CASE
    WHEN ms.status IN ('Completed','Cancelled','In Progress') THEN ms.status
    WHEN ms.next_due < CURRENT_DATE                          THEN 'Overdue'
    WHEN ms.next_due <= CURRENT_DATE + ms.alert_days         THEN 'Due Soon'
    ELSE 'Scheduled'
  END AS live_status,
  (ms.next_due - CURRENT_DATE) AS days_until_due
FROM maintenance_schedules ms
LEFT JOIN assets a ON a.asset_id = ms.asset_id;

-- ─────────────────────────────────────────────────────────────────────────────
--  VIEW: certificates with computed expiry status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_certificates AS
SELECT
  c.*,
  a.name     AS asset_name,
  a.serial   AS asset_serial,
  a.rig_name,
  a.category,
  CASE
    WHEN c.next_inspection IS NULL               THEN 'No Certificate'
    WHEN c.next_inspection < CURRENT_DATE        THEN 'Expired'
    WHEN c.next_inspection <= CURRENT_DATE + c.alert_days THEN 'Expiring Soon'
    ELSE 'Valid'
  END AS cert_status,
  (c.next_inspection - CURRENT_DATE) AS days_until_expiry
FROM certificates c
LEFT JOIN assets a ON a.asset_id = c.asset_id;

-- ─────────────────────────────────────────────────────────────────────────────
--  VIEW: asset rich summary for dashboard / list
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_summary AS
SELECT
  a.*,
  r.type      AS rig_type,
  r.status    AS rig_status,
  r.location  AS rig_location,
  con.id        AS active_contract_id,
  con.end_date  AS contract_end_date,
  con.value     AS contract_value,
  (SELECT COUNT(*) FROM bom_items b WHERE b.asset_id = a.asset_id)            AS bom_count,
  (SELECT COUNT(*) FROM maintenance_schedules m WHERE m.asset_id = a.asset_id
    AND m.next_due < CURRENT_DATE AND m.status NOT IN ('Completed','Cancelled')) AS overdue_maint_count,
  (SELECT MIN(next_inspection) FROM certificates cert WHERE cert.asset_id = a.asset_id) AS next_cert_date
FROM assets a
LEFT JOIN rigs r ON r.name = a.rig_name
LEFT JOIN contract_assets ca ON ca.asset_id = a.asset_id
LEFT JOIN contracts con ON con.id = ca.contract_id AND con.status = 'Active';

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS — enable but keep permissive for service-role key (API server)
--  For user-level access, add policies per your auth strategy.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rigs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- Service-role (used by Railway API) bypasses RLS automatically.
-- For anon/authenticated users, add policies here as needed, e.g.:
-- CREATE POLICY "allow_authenticated_read" ON assets FOR SELECT TO authenticated USING (true);
