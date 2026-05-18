-- Plan assignment hardening
--
-- Problem:
--   1. migrations/021 auto_create_personal_workspace() trigger searches for
--      plans.name = 'free', but migrations/073 renamed that plan to 'starter'.
--      Every personal workspace created after 073 silently had no subscription.
--   2. check_usage_limit() returns false for any org without an active
--      subscription, so those orgs are hard-blocked from all AI/API metrics
--      even though the frontend fallback (src/lib/plans/index.ts) treats them
--      as starter.
--   3. No defence-in-depth: any future code path that inserts into
--      organizations without going through createOrganization() produces an
--      org with no subscription and no way to recover.
--
-- Fix (idempotent, safe to re-run):
--   A. Rewrite auto_create_personal_workspace() to look up 'starter', to hard
--      search_path, and to give the free sub a real monthly period.
--   B. Add ensure_org_has_starter_subscription() AFTER INSERT trigger on
--      organizations — belt-and-braces for any code path that forgets.
--   C. Rewrite check_usage_limit() to fall back to the starter plan limits
--      when no subscription exists, matching the frontend fallback.
--   D. Backfill every existing org that has no active subscription.

-- ---------------------------------------------------------------------------
-- Sanity check: the canonical free plan must exist and be active.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_plans boolean;
  v_has_subscriptions boolean;
  v_has_starter boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plans'
  ) INTO v_has_plans;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) INTO v_has_subscriptions;

  IF NOT v_has_plans OR NOT v_has_subscriptions THEN
    RAISE NOTICE
      'plan_assignment_hardening: skipping because plans/subscriptions are not installed in this deployment';
    RETURN;
  END IF;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1 FROM plans WHERE name = 'starter' AND is_active = true
    )
  $sql$ INTO v_has_starter;

  IF NOT v_has_starter THEN
    RAISE EXCEPTION
      'plan_assignment_hardening: no active plan named "starter" — cannot proceed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A. Rewrite auto_create_personal_workspace() to use 'starter'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_create_personal_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
BEGIN
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);

  INSERT INTO organizations (slug, name, type, created_by, created_at, updated_at)
  VALUES (
    v_slug,
    NEW.handle || '''s Workspace',
    'personal',
    NEW.id,
    v_now,
    v_now
  )
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (
    org_id, organization_id, user_id, role, created_at, joined_at
  ) VALUES (
    v_org_id, v_org_id, NEW.id, 'owner', v_now, v_now
  );

  -- Starter plan was previously named 'free' (see migrations/073_rename_plans.sql)
  SELECT id INTO v_plan_id
  FROM plans
  WHERE name = 'starter' AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE WARNING
      'auto_create_personal_workspace: no active starter plan, org % has no subscription',
      v_org_id;
    RETURN NEW;
  END IF;

  INSERT INTO subscriptions (
    org_id, plan_id, status, billing_period, payment_method,
    current_period_start, current_period_end, created_at, updated_at
  ) VALUES (
    v_org_id, v_plan_id, 'active', 'monthly', 'stripe_card',
    v_now, v_period_end, v_now, v_now
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- B. Belt-and-braces: every org must have a starter subscription on insert.
--    This is a no-op when createOrganization() already inserted one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_org_has_starter_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
BEGIN
  -- Already has an active sub? Nothing to do.
  IF EXISTS (
    SELECT 1 FROM subscriptions WHERE org_id = NEW.id AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_plan_id
  FROM plans
  WHERE name = 'starter' AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE WARNING
      'ensure_org_has_starter_subscription: no active starter plan, org % has no subscription',
      NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO subscriptions (
    org_id, plan_id, status, billing_period, payment_method,
    current_period_start, current_period_end, created_at, updated_at
  ) VALUES (
    NEW.id, v_plan_id, 'active', 'monthly', 'stripe_card',
    v_now, v_period_end, v_now, v_now
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_org_has_starter_subscription_trigger ON organizations;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plans'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) THEN
    CREATE TRIGGER ensure_org_has_starter_subscription_trigger
      AFTER INSERT ON organizations
      FOR EACH ROW
      EXECUTE FUNCTION ensure_org_has_starter_subscription();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C. check_usage_limit(): fall back to the starter plan limits when the org
--    has no active subscription, matching src/lib/plans/index.ts:204-220.
--    Hard-blocking unsubscribed orgs was the root cause of the production
--    "AI query limit exceeded" error with 0 messages sent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_org_id UUID,
  p_metric_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_limits JSONB;
  v_limit INTEGER;
  v_current_usage INTEGER;
BEGIN
  -- Primary path: active subscription.
  SELECT * INTO v_subscription
  FROM get_org_subscription(p_org_id);

  IF FOUND THEN
    v_limits := v_subscription.limits;
  ELSE
    -- Fallback: use starter plan limits. Matches the frontend fallback in
    -- src/lib/plans/index.ts so worker and frontend agree on "no sub = starter".
    SELECT limits INTO v_limits
    FROM plans
    WHERE name = 'starter' AND is_active = true
    LIMIT 1;

    IF v_limits IS NULL THEN
      -- No starter plan configured — fail closed.
      RETURN false;
    END IF;
  END IF;

  v_limit := (v_limits ->> p_metric_name)::INTEGER;

  -- Unknown metric → allow (same behaviour as the frontend getUsageStatus fallback)
  IF v_limit IS NULL THEN
    RETURN true;
  END IF;

  -- -1 means unlimited
  IF v_limit = -1 THEN
    RETURN true;
  END IF;

  v_current_usage := get_current_usage(p_org_id, p_metric_name);

  RETURN v_current_usage < v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- D. Backfill: every org without an active subscription gets one now.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_plan_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  v_inserted INTEGER := 0;
  v_has_plans boolean;
  v_has_subscriptions boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plans'
  ) INTO v_has_plans;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) INTO v_has_subscriptions;

  IF NOT v_has_plans OR NOT v_has_subscriptions THEN
    RAISE NOTICE
      'plan_assignment_hardening: skipping backfill because plans/subscriptions are not installed in this deployment';
    RETURN;
  END IF;

  EXECUTE $sql$
    SELECT id
    FROM plans
    WHERE name = 'starter' AND is_active = true
    LIMIT 1
  $sql$ INTO v_plan_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_assignment_hardening: no active starter plan for backfill';
  END IF;

  INSERT INTO subscriptions (
    org_id, plan_id, status, billing_period, payment_method,
    current_period_start, current_period_end, created_at, updated_at
  )
  SELECT
    o.id, v_plan_id, 'active', 'monthly', 'stripe_card',
    v_now, v_period_end, v_now, v_now
  FROM organizations o
  WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.org_id = o.id AND s.status = 'active'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'plan_assignment_hardening: backfilled % organizations with starter subscription', v_inserted;
END $$;
