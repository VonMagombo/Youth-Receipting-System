/** Minimal async SQL interface, implemented by expo-sqlite on device and node:sqlite in tests. */
export interface Db {
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  /** Exclusive transaction; `tx` must be used for every statement inside it. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
export type SqlParam = string | number | null;

export const SCHEMA_VERSION = 1;

export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  member_no   TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  start_month TEXT NOT NULL CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  receipt_no   TEXT NOT NULL UNIQUE,
  member_id    TEXT NOT NULL REFERENCES members(id),
  amount_usd   INTEGER NOT NULL CHECK (amount_usd > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash','mobile')),
  mobile_ref   TEXT,
  paid_on      TEXT NOT NULL,
  collected_by TEXT NOT NULL,
  key_id       TEXT,
  signature    TEXT,
  claim_json   TEXT NOT NULL,
  imported     INTEGER NOT NULL DEFAULT 0,
  fingerprint  TEXT,
  created_at   TEXT NOT NULL,
  synced_at    TEXT
);
CREATE INDEX IF NOT EXISTS payments_paid_on ON payments(paid_on);
CREATE INDEX IF NOT EXISTS payments_member ON payments(member_id);

CREATE TABLE IF NOT EXISTS payment_months (
  payment_id TEXT NOT NULL REFERENCES payments(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  month      TEXT NOT NULL,
  PRIMARY KEY (payment_id, month)
);
CREATE INDEX IF NOT EXISTS payment_months_member ON payment_months(member_id, month);

CREATE TABLE IF NOT EXISTS voids (
  id         TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  voided_by  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at  TEXT
);

CREATE TABLE IF NOT EXISTS exemptions (
  id          TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL REFERENCES members(id),
  month       TEXT NOT NULL,
  reason      TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  synced_at   TEXT,
  UNIQUE (member_id, month)
);

CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);

-- Append-only guarantees. These stop application bugs and casual tampering through the app;
-- they are not a defence against someone with root access to the phone (the signatures and,
-- in Phase 2, the cloud copy are).
CREATE TRIGGER IF NOT EXISTS payments_immutable
BEFORE UPDATE OF id, receipt_no, member_id, amount_usd, method, mobile_ref, paid_on, collected_by,
                 key_id, signature, claim_json, imported, fingerprint, created_at ON payments
BEGIN SELECT RAISE(ABORT, 'payments are append-only'); END;
CREATE TRIGGER IF NOT EXISTS payments_no_delete BEFORE DELETE ON payments
BEGIN SELECT RAISE(ABORT, 'payments cannot be deleted; void them instead'); END;
CREATE TRIGGER IF NOT EXISTS payment_months_immutable BEFORE UPDATE ON payment_months
BEGIN SELECT RAISE(ABORT, 'payment months are append-only'); END;
CREATE TRIGGER IF NOT EXISTS payment_months_no_delete BEFORE DELETE ON payment_months
BEGIN SELECT RAISE(ABORT, 'payment months cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS voids_immutable
BEFORE UPDATE OF id, payment_id, reason, voided_by, created_at ON voids
BEGIN SELECT RAISE(ABORT, 'voids are append-only'); END;
CREATE TRIGGER IF NOT EXISTS voids_no_delete BEFORE DELETE ON voids
BEGIN SELECT RAISE(ABORT, 'voids cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS audit_immutable BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
`;
