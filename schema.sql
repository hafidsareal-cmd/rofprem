-- schema.sql
-- Jalankan di Supabase SQL Editor
-- Kolom disesuaikan persis dengan query di api/admin.js

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT        UNIQUE NOT NULL,
  password     TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  activated    BOOLEAN     DEFAULT false,
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Activation Codes ─────────────────────────────────────────────────────────
-- Kolom status pakai ENUM: available | used | expired | revoked
-- Ini yang dipake di semua query admin: filter, update, count

CREATE TABLE IF NOT EXISTS activation_codes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT        UNIQUE NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','used','expired','revoked')),
  duration_days INT         NOT NULL DEFAULT 30,
  batch_id      UUID,
  note          TEXT,
  used_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  used_by_email TEXT,
  activated_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
-- Nama tabel: audit_log (bukan audit_logs) — sesuai query di admin.js

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  action     TEXT        NOT NULL,
  actor      TEXT,
  meta       JSONB       DEFAULT '{}',
  ip_addr    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_codes_status       ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_codes_batch        ON activation_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_code         ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_codes_activated_at ON activation_codes(activated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
