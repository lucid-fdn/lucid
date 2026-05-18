-- Payment provider integration: NOWPayments support + checkout_attempts

-- 1. Extend payments.provider CHECK to include 'nowpayments'
--    Self-hosted: payments table may not exist (billing bypassed). Skip gracefully.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payments') THEN
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
    ALTER TABLE payments ADD CONSTRAINT payments_provider_check
      CHECK (provider IN ('stripe', 'coinbase', 'nowpayments'));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
      ON payments (provider, provider_payment_id);
  END IF;
END $$;

-- 3. Checkout attempts — source of truth for crypto checkout sessions
CREATE TABLE IF NOT EXISTS checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  billing_period TEXT NOT NULL DEFAULT 'yearly',
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'nowpayments')),
  provider_invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'partial', 'expired', 'failed')),
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_org ON checkout_attempts (org_id);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_provider_invoice
  ON checkout_attempts (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;

ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkout_attempts_service_only ON checkout_attempts
  FOR ALL USING (auth.role() = 'service_role');
