-- ============================================================
-- rofprem v2 — Supabase Schema
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users (email+password auth) ───────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  verify_token    TEXT,
  verify_expires  TIMESTAMPTZ,
  premium_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email         ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_verify_token  ON users (verify_token);

-- ── Activation Codes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activation_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        NOT NULL UNIQUE,
  status        TEXT        NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','used','expired','revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  used_by       UUID        REFERENCES users(id),
  used_by_email TEXT,
  batch_id      UUID,
  note          TEXT
);

-- NOTE: We store code PLAINTEXT (no hash) — makes lookup simple and
-- debugging easy. Codes are random 16-char hex, not passwords.

CREATE INDEX IF NOT EXISTS idx_codes_code     ON activation_codes (code);
CREATE INDEX IF NOT EXISTS idx_codes_status   ON activation_codes (status);
CREATE INDEX IF NOT EXISTS idx_codes_batch    ON activation_codes (batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_used_by  ON activation_codes (used_by);

-- ── User Sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  ip_addr    TEXT
);

CREATE INDEX IF NOT EXISTS idx_usess_token   ON user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_usess_user    ON user_sessions (user_id);

-- ── Admin Sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
  ip_addr    TEXT
);

CREATE INDEX IF NOT EXISTS idx_asess_token ON admin_sessions (token_hash);

-- ── Audit Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL   PRIMARY KEY,
  action     TEXT        NOT NULL,
  actor      TEXT,
  meta       JSONB,
  ip_addr    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at DESC);

-- ── Rate Limits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT        PRIMARY KEY,
  count      INT         NOT NULL DEFAULT 1,
  window_end TIMESTAMPTZ NOT NULL
);

-- ── Auto-expire codes ────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_codes() RETURNS void AS $$
  UPDATE activation_codes
  SET status = 'expired'
  WHERE status = 'used'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
$$ LANGUAGE sql;

-- ── Stats view ───────────────────────────────────────────────
CREATE OR REPLACE VIEW code_stats AS
SELECT
  COUNT(*)                                                        AS total,
  COUNT(*) FILTER (WHERE status = 'available')                    AS available,
  COUNT(*) FILTER (WHERE status = 'used')                         AS used,
  COUNT(*) FILTER (WHERE status = 'expired')                      AS expired,
  COUNT(*) FILTER (WHERE status = 'revoked')                      AS revoked,
  COUNT(*) FILTER (WHERE activated_at >= NOW() - INTERVAL '24h')  AS activated_today
FROM activation_codes;

-- Disable RLS — backend uses service_role
ALTER TABLE users            DISABLE ROW LEVEL SECURITY;
ALTER TABLE activation_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits      DISABLE ROW LEVEL SECURITY;
