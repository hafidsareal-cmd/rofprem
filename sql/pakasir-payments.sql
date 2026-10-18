-- Pakasir activation-code purchases. Run in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount = 20000),
  project text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed')),
  payment_method text NOT NULL DEFAULT 'qris',
  txn_id text,
  qr_string text,
  total_payment integer,
  expires_at timestamptz,
  paid_at timestamptz,
  activation_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
ALTER TABLE payment_orders DISABLE ROW LEVEL SECURITY;

-- Idempotent finalization: only a verified pending order may issue one code.
CREATE OR REPLACE FUNCTION finalize_pakasir_order(p_order_id text, p_project text, p_amount integer, p_code text)
RETURNS TABLE(issued_code text, order_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM payment_orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.project <> p_project OR o.amount <> p_amount THEN
    RAISE EXCEPTION 'order mismatch';
  END IF;
  IF o.status = 'paid' AND o.activation_code IS NOT NULL THEN
    RETURN QUERY SELECT o.activation_code, o.status;
    RETURN;
  END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'order is not pending'; END IF;
  INSERT INTO activation_codes(code,status,created_at,note)
    VALUES (p_code,'available',now(),'Pakasir paid order ' || p_order_id);
  UPDATE payment_orders SET status='paid', paid_at=now(), activation_code=p_code
    WHERE order_id=p_order_id;
  RETURN QUERY SELECT p_code, 'paid'::text;
END; $$;
