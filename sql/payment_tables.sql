-- AM Premium — Payment Tables (Clean, No RLS)
-- Jalankan sekali di Supabase SQL Editor

-- Drop dulu kalau ada sisa
DROP TABLE IF EXISTS activation_codes CASCADE;
DROP TABLE IF EXISTS pending_orders CASCADE;

-- ─────────────────────────────────────────
-- 1. pending_orders
-- ─────────────────────────────────────────
CREATE TABLE pending_orders (
  id             BIGSERIAL PRIMARY KEY,
  external_id    TEXT        NOT NULL UNIQUE,
  transaction_id TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  amount         INTEGER     NOT NULL DEFAULT 15000,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_orders_external_id ON pending_orders (external_id);
CREATE INDEX idx_pending_orders_created_at  ON pending_orders (created_at);

-- ─────────────────────────────────────────
-- 2. activation_codes
-- ─────────────────────────────────────────
CREATE TABLE activation_codes (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT        NOT NULL UNIQUE,
  email          TEXT        NOT NULL,
  transaction_id TEXT        NOT NULL UNIQUE,
  external_id    TEXT        NOT NULL,
  amount         INTEGER     NOT NULL DEFAULT 15000,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activation_codes_code       ON activation_codes (code);
CREATE INDEX idx_activation_codes_email      ON activation_codes (email);
CREATE INDEX idx_activation_codes_expires_at ON activation_codes (expires_at);
