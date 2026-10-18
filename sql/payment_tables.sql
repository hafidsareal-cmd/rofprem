-- AM Premium — Payment Tables (Pakasir)
-- Jalankan sekali di Supabase SQL Editor

DROP TABLE IF EXISTS activation_codes CASCADE;
DROP TABLE IF EXISTS pending_orders CASCADE;

-- pending_orders: order yang belum dibayar
CREATE TABLE pending_orders (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT        NOT NULL UNIQUE,
  txn_id     TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  amount     INTEGER     NOT NULL DEFAULT 15000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_orders_order_id ON pending_orders (order_id);

-- activation_codes: kode yang sudah dibayar
CREATE TABLE activation_codes (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,
  email      TEXT        NOT NULL,
  txn_id     TEXT        NOT NULL UNIQUE,
  order_id   TEXT        NOT NULL,
  amount     INTEGER     NOT NULL DEFAULT 15000,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activation_codes_code       ON activation_codes (code);
CREATE INDEX idx_activation_codes_email      ON activation_codes (email);
CREATE INDEX idx_activation_codes_expires_at ON activation_codes (expires_at);
