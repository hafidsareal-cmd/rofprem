-- RofPrem Pakasir payment orders
-- Run this once in Supabase Dashboard -> SQL Editor.
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  txn_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  amount INTEGER NOT NULL CHECK (amount = quantity * 20000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'canceled')),
  issued_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_amount_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_amount_check CHECK (amount > 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_payment_orders_user
  ON public.payment_orders(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fulfill_paid_order(
  p_order_id TEXT,
  p_txn_id TEXT,
  p_amount INTEGER,
  p_codes TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO ord
  FROM public.payment_orders
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found';
  END IF;

  IF ord.txn_id <> p_txn_id OR ord.amount <> p_amount THEN
    RAISE EXCEPTION 'Payment details do not match';
  END IF;

  -- Idempotent: repeated status checks return the original codes.
  IF ord.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'completed', 'codes', to_jsonb(ord.issued_codes));
  END IF;

  IF ord.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment order is not pending';
  END IF;

  IF p_codes IS NULL OR cardinality(p_codes) <> ord.quantity THEN
    RAISE EXCEPTION 'Invalid number of activation codes';
  END IF;

  INSERT INTO public.activation_codes (code, status, note)
  SELECT code_value, 'available', 'Pakasir order ' || ord.order_id
  FROM unnest(p_codes) AS item(code_value);

  UPDATE public.payment_orders
  SET status = 'completed',
      issued_codes = p_codes,
      completed_at = NOW()
  WHERE id = ord.id;

  RETURN jsonb_build_object('status', 'completed', 'codes', to_jsonb(p_codes));
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_paid_order(TEXT, TEXT, INTEGER, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_paid_order(TEXT, TEXT, INTEGER, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_paid_order(TEXT, TEXT, INTEGER, TEXT[]) TO service_role;

ALTER TABLE public.payment_orders DISABLE ROW LEVEL SECURITY;
