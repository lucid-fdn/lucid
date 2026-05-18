-- ============================================================================
-- Tier System: Plans, Subscriptions, Payments, Usage Tracking
-- ============================================================================
-- Migration: 020_plans_subscriptions
-- Purpose: Add tier/pricing system with multi-payment support
-- Author: AI Assistant
-- Date: 2025-10-10
--
-- Features:
-- - Plans (Free, Pro, Enterprise)
-- - Org-level subscriptions
-- - Payment history (Stripe + Crypto)
-- - Usage tracking & limits
-- - RLS policies
-- - Helper functions
-- ============================================================================

-- ============================================================================
-- 1. PLANS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan identification
  name TEXT NOT NULL UNIQUE CHECK (name IN ('free', 'pro', 'enterprise')),
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Pricing (in cents for fiat, string for crypto)
  price_monthly_usd INTEGER, -- in cents (e.g., 2900 = $29.00)
  price_yearly_usd INTEGER,  -- in cents (e.g., 29000 = $290.00)
  price_monthly_crypto TEXT, -- in USDC (e.g., '29.00')
  price_yearly_crypto TEXT,  -- in USDC (e.g., '290.00')
  
  -- Features (JSONB for flexibility)
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"ai_agents": true, "custom_domain": true, "api_access": true}
  
  -- Limits (JSONB for flexibility)
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"api_calls_monthly": 10000, "storage_gb": 100, "team_members": 5}
  -- Note: -1 means unlimited
  
  -- Payment provider IDs
  stripe_product_id TEXT,
  stripe_price_monthly_id TEXT,
  stripe_price_yearly_id TEXT,
  coinbase_product_id TEXT,
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for plans
CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON plans(sort_order) WHERE is_active = true;

-- ============================================================================
-- 2. SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  
  -- Subscription details
  status TEXT NOT NULL CHECK (status IN (
    'active',      -- Subscription is active
    'trialing',    -- In trial period
    'past_due',    -- Payment failed but grace period active
    'canceled',    -- Canceled (may still be active until period end)
    'paused'       -- Temporarily paused
  )),
  
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  
  payment_method TEXT NOT NULL CHECK (payment_method IN (
    'stripe_card',    -- Credit/debit card via Stripe
    'stripe_paypal',  -- PayPal via Stripe
    'crypto'          -- Cryptocurrency via Coinbase Commerce
  )),
  
  -- Period tracking
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  
  -- Payment provider IDs (only one will be set per subscription)
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  coinbase_charge_id TEXT,
  crypto_wallet_address TEXT,
  
  -- Metadata (flexible storage for provider-specific data)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_unique_active_per_org ON subscriptions(org_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end);

-- ============================================================================
-- 3. PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Payment details
  amount INTEGER NOT NULL, -- in cents for fiat, smallest unit for crypto
  currency TEXT NOT NULL DEFAULT 'usd', -- 'usd', 'usdc', 'eth', 'btc'
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending',    -- Payment initiated but not confirmed
    'succeeded',  -- Payment successful
    'failed',     -- Payment failed
    'refunded'    -- Payment refunded
  )),
  
  -- Provider details
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'coinbase')),
  provider_payment_id TEXT NOT NULL,
  provider_customer_id TEXT,
  
  -- Blockchain details (for crypto payments)
  transaction_hash TEXT,
  block_number BIGINT,
  wallet_address TEXT,
  confirmations INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- ============================================================================
-- 4. USAGE METRICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_name TEXT NOT NULL,
  -- Examples: 'api_calls', 'storage_mb', 'active_users', 'ai_queries'
  
  metric_value INTEGER NOT NULL DEFAULT 0,
  
  -- Period tracking (monthly periods)
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  -- One metric per org per period
  CONSTRAINT unique_metric_per_org_per_period 
    UNIQUE (org_id, metric_name, period_start, period_end)
);

-- Indexes for usage_metrics
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org_id ON usage_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_metric_name ON usage_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org_metric ON usage_metrics(org_id, metric_name);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Plans table (public read)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plans are publicly readable" ON plans;
CREATE POLICY "Plans are publicly readable"
  ON plans FOR SELECT
  USING (is_active = true);

-- Subscriptions table
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their org's subscription
DROP POLICY IF EXISTS "Users can view org subscription" ON subscriptions;
CREATE POLICY "Users can view org subscription"
  ON subscriptions FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Only org admins/owners can modify subscriptions
DROP POLICY IF EXISTS "Admins can modify org subscription" ON subscriptions;
CREATE POLICY "Admins can modify org subscription"
  ON subscriptions FOR ALL
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  );

-- Payments table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can view their org's payment history
DROP POLICY IF EXISTS "Users can view org payments" ON payments;
CREATE POLICY "Users can view org payments"
  ON payments FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Only service role can insert/update payments (from webhooks)
DROP POLICY IF EXISTS "Service role can manage payments" ON payments;
CREATE POLICY "Service role can manage payments"
  ON payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Usage metrics table
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their org's usage
DROP POLICY IF EXISTS "Users can view org usage" ON usage_metrics;
CREATE POLICY "Users can view org usage"
  ON usage_metrics FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role can manage usage metrics
DROP POLICY IF EXISTS "Service role can manage usage metrics" ON usage_metrics;
CREATE POLICY "Service role can manage usage metrics"
  ON usage_metrics FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Update updated_at on plans
DROP TRIGGER IF EXISTS update_plans_updated_at ON plans;
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at on subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at on payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get org subscription with plan details
CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  org_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  status TEXT,
  billing_period TEXT,
  payment_method TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  features JSONB,
  limits JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as subscription_id,
    s.org_id,
    s.plan_id,
    p.name as plan_name,
    p.display_name as plan_display_name,
    s.status,
    s.billing_period,
    s.payment_method,
    s.current_period_start,
    s.current_period_end,
    p.features,
    p.limits
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.org_id = p_org_id
    AND s.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Increment usage metric (upsert)
CREATE OR REPLACE FUNCTION increment_usage_metric(
  p_org_id UUID,
  p_metric_name TEXT,
  p_amount INTEGER,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_metrics (
    org_id,
    metric_name,
    metric_value,
    period_start,
    period_end
  ) VALUES (
    p_org_id,
    p_metric_name,
    p_amount,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (org_id, metric_name, period_start, period_end)
  DO UPDATE SET
    metric_value = usage_metrics.metric_value + p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Get current usage for a metric
CREATE OR REPLACE FUNCTION get_current_usage(
  p_org_id UUID,
  p_metric_name TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_usage INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Calculate current month period
  v_period_start := date_trunc('month', NOW());
  v_period_end := date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second';
  
  SELECT COALESCE(metric_value, 0)
  INTO v_usage
  FROM usage_metrics
  WHERE org_id = p_org_id
    AND metric_name = p_metric_name
    AND period_start = v_period_start
    AND period_end >= v_period_end;
  
  RETURN COALESCE(v_usage, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Check if org has exceeded limit
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_org_id UUID,
  p_metric_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_limit INTEGER;
  v_current_usage INTEGER;
BEGIN
  -- Get subscription and limit
  SELECT * INTO v_subscription
  FROM get_org_subscription(p_org_id);
  
  IF NOT FOUND THEN
    RETURN false; -- No subscription = free tier = blocked
  END IF;
  
  -- Get limit from plan
  v_limit := (v_subscription.limits ->> p_metric_name)::INTEGER;
  
  -- -1 means unlimited
  IF v_limit = -1 THEN
    RETURN true;
  END IF;
  
  -- Get current usage
  v_current_usage := get_current_usage(p_org_id, p_metric_name);
  
  -- Check if under limit
  RETURN v_current_usage < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- 8. SEED DATA - PLANS
-- ============================================================================

-- Free Plan
INSERT INTO plans (
  name,
  display_name,
  description,
  price_monthly_usd,
  price_yearly_usd,
  price_monthly_crypto,
  price_yearly_crypto,
  features,
  limits,
  is_active,
  is_featured,
  sort_order
) VALUES (
  'free',
  'Free',
  'Perfect for getting started and exploring the platform',
  0,
  0,
  '0',
  '0',
  '{
    "ai_agents": false,
    "custom_functions": false,
    "analytics": false,
    "api_access": false,
    "custom_domain": false,
    "priority_support": false,
    "team_collaboration": false,
    "advanced_security": false
  }'::jsonb,
  '{
    "api_calls_monthly": 1000,
    "storage_gb": 1,
    "projects": 1,
    "team_members": 1,
    "ai_queries_monthly": 100,
    "functions": 5
  }'::jsonb,
  true,
  false,
  1
) ON CONFLICT (name) DO NOTHING;

-- Pro Plan
INSERT INTO plans (
  name,
  display_name,
  description,
  price_monthly_usd,
  price_yearly_usd,
  price_monthly_crypto,
  price_yearly_crypto,
  features,
  limits,
  is_active,
  is_featured,
  sort_order
) VALUES (
  'pro',
  'Professional',
  'For power users and small teams building production applications',
  2900,  -- $29.00/month
  29000, -- $290.00/year (save $58)
  '29.00',
  '290.00',
  '{
    "ai_agents": true,
    "custom_functions": true,
    "analytics": true,
    "api_access": true,
    "custom_domain": false,
    "priority_support": true,
    "team_collaboration": true,
    "advanced_security": false
  }'::jsonb,
  '{
    "api_calls_monthly": 100000,
    "storage_gb": 50,
    "projects": 10,
    "team_members": 5,
    "ai_queries_monthly": 10000,
    "functions": 100
  }'::jsonb,
  true,
  true,
  2
) ON CONFLICT (name) DO NOTHING;

-- Enterprise Plan
INSERT INTO plans (
  name,
  display_name,
  description,
  price_monthly_usd,
  price_yearly_usd,
  price_monthly_crypto,
  price_yearly_crypto,
  features,
  limits,
  is_active,
  is_featured,
  sort_order
) VALUES (
  'enterprise',
  'Enterprise',
  'For large organizations with advanced needs and compliance requirements',
  NULL,  -- Contact sales
  NULL,
  NULL,
  NULL,
  '{
    "ai_agents": true,
    "custom_functions": true,
    "analytics": true,
    "api_access": true,
    "custom_domain": true,
    "priority_support": true,
    "team_collaboration": true,
    "advanced_security": true,
    "sla": true,
    "dedicated_support": true,
    "custom_contracts": true,
    "audit_logs": true,
    "sso": true
  }'::jsonb,
  '{
    "api_calls_monthly": -1,
    "storage_gb": -1,
    "projects": -1,
    "team_members": -1,
    "ai_queries_monthly": -1,
    "functions": -1
  }'::jsonb,
  true,
  false,
  3
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 9. ASSIGN FREE PLAN TO ALL EXISTING ORGS
-- ============================================================================

-- Create free subscriptions for all existing organizations
INSERT INTO subscriptions (
  org_id,
  plan_id,
  status,
  billing_period,
  payment_method,
  current_period_start,
  current_period_end
)
SELECT 
  o.id as org_id,
  p.id as plan_id,
  'active' as status,
  'monthly' as billing_period,
  'stripe_card' as payment_method,
  NOW() as current_period_start,
  NOW() + INTERVAL '1 year' as current_period_end
FROM organizations o
CROSS JOIN plans p
WHERE p.name = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s 
    WHERE s.org_id = o.id
  );

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Tier system migration completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Created:';
  RAISE NOTICE '  - plans table (3 tiers: Free, Pro, Enterprise)';
  RAISE NOTICE '  - subscriptions table';
  RAISE NOTICE '  - payments table';
  RAISE NOTICE '  - usage_metrics table';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Security:';
  RAISE NOTICE '  - RLS policies enabled on all tables';
  RAISE NOTICE '  - Users can only access own org data';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Functions:';
  RAISE NOTICE '  - get_org_subscription()';
  RAISE NOTICE '  - increment_usage_metric()';
  RAISE NOTICE '  - get_current_usage()';
  RAISE NOTICE '  - check_usage_limit()';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 All existing orgs assigned to Free plan';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Ready for tier system implementation!';
END $$;
