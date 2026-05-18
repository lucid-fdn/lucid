-- Migration: Rename plan tiers to match gateway
-- free → starter, enterprise → business

-- 1. Update plans table
UPDATE plans SET name = 'starter', display_name = 'Starter' WHERE name = 'free';
UPDATE plans SET name = 'business', display_name = 'Business' WHERE name = 'enterprise';

-- 2. Update check constraint
ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_name_check;
ALTER TABLE plans
  ADD CONSTRAINT plans_name_check
  CHECK (name IN ('starter', 'pro', 'business'));

-- 3. Update subscriptions that reference old plan names (via plan_id FK, auto-resolved)
-- No action needed — subscriptions reference plan_id, not plan name directly

-- 4. Enable video_studio feature for pro and business plans
UPDATE plans
  SET features = COALESCE(features, '{}'::jsonb) || '{"video_studio": true, "video_enabled": true}'::jsonb
  WHERE name IN ('pro', 'business');

-- 5. Set video render limits for pro and business plans
UPDATE plans
  SET limits = COALESCE(limits, '{}'::jsonb) || '{"video_renders_per_month": 50}'::jsonb
  WHERE name = 'pro';
UPDATE plans
  SET limits = COALESCE(limits, '{}'::jsonb) || '{"video_renders_per_month": -1}'::jsonb
  WHERE name = 'business';
