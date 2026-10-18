-- RofPrem: reconcile older activation_codes tables with the current backend.
-- Safe for existing rows: does not drop tables, columns, or data.
-- Run in Supabase SQL Editor on the same project used by Vercel.

ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_by_email TEXT;

-- Preserve the existing id type/default (it may be BIGINT with a sequence).
-- Older versions may have required payment-only fields on activation_codes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activation_codes'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE public.activation_codes ALTER COLUMN email DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activation_codes'
      AND column_name = 'txn_id'
  ) THEN
    ALTER TABLE public.activation_codes ALTER COLUMN txn_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.activation_codes
  ALTER COLUMN status SET DEFAULT 'available',
  ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_codes_batch
  ON public.activation_codes (batch_id);

NOTIFY pgrst, 'reload schema';
