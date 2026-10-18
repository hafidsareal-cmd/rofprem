-- schema.sql
-- Run di Supabase SQL Editor
-- Urutan penting: users dulu, baru tabel yang reference-nya

-- ─── Users ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT        UNIQUE NOT NULL,
  password      TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  activated     BOOLEAN     DEFAULT false,
  activated_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Activation Codes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activation_codes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT        UNIQUE NOT NULL,
  is_used       BOOLEAN     DEFAULT false,
  used_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  duration_days INT         NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

-- ─── Activations (history pakai kode) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS activations (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_id       UUID        NOT NULL REFERENCES activation_codes(id) ON DELETE CASCADE,
  activated_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL
);

-- ─── Audit Logs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email   TEXT,
  action        TEXT        NOT NULL,
  detail        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_codes_code           ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_codes_is_used        ON activation_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_activations_user     ON activations(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_logs(created_at DESC);

-- ─── Admin default (ganti password setelah setup) ─────────────────────────
-- Password default: admin123 (bcrypt hash)
-- WAJIB diganti via panel atau query setelah pertama login

INSERT INTO users (email, password, role)
VALUES (
  'admin@rofprem.local',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- "password" (demo)
  'admin'
)
ON CONFLICT (email) DO NOTHING;
