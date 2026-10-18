-- AM Premium — Payment Tables
-- Jalankan di Supabase SQL Editor

-- ─────────────────────────────────────────
-- 1. pending_orders
--    Menyimpan order yang belum dibayar
--    Dihapus otomatis setelah webhook sukses
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_orders (
  id             BIGSERIAL PRIMARY KEY,
  external_id    TEXT        NOT NULL UNIQUE,
  transaction_id TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  amount         INTEGER     NOT NULL DEFAULT 15000,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cleanup order lebih dari 2 jam (opsional, via pg_cron atau manual)
CREATE INDEX IF NOT EXISTS idx_pending_orders_external_id ON pending_orders (external_id);
CREATE INDEX IF NOT EXISTS idx_pending_orders_created_at  ON pending_orders (created_at);

-- ─────────────────────────────────────────
-- 2. activation_codes
--    Kode aktivasi yang sudah dibayar
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activation_codes (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT        NOT NULL UNIQUE,
  email          TEXT        NOT NULL,
  transaction_id TEXT        NOT NULL UNIQUE,  -- idempotency guard
  external_id    TEXT        NOT NULL,
  amount         INTEGER     NOT NULL DEFAULT 15000,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,                  -- NULL = belum dipakai
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_code       ON activation_codes (code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_email      ON activation_codes (email);
CREATE INDEX IF NOT EXISTS idx_activation_codes_expires_at ON activation_codes (expires_at);

-- ─────────────────────────────────────────
-- 3. Row Level Security
--    Service key (backend) bisa segalanya
--    Anon key (frontend) tidak bisa baca
-- ─────────────────────────────────────────
ALTER TABLE pending_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_codes  ENABLE ROW LEVEL SECURITY;

-- Hanya service_role yang bisa akses (backend pakai SUPABASE_SERVICE_KEY)
CREATE POLICY "service only" ON pending_orders
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service only" ON activation_codes
  FOR ALL USING (auth.role() = 'service_role');
