-- Fix Admin Panel code generation: add batch_id if the live table is older.
ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_codes_batch
  ON public.activation_codes (batch_id);

-- Ask PostgREST/Supabase API to refresh its schema cache.
NOTIFY pgrst, 'reload schema';
