-- Backfill live plan rows with plugin entitlements and make the DB trigger
-- resilient to legacy plan names still present in production.
--
-- Live production currently contains plan names like:
--   free / pro / growth / internal
-- while the app entitlement layer has moved to:
--   starter / pro / business
--
-- This migration:
--   1. backfills plugin-related feature/limit keys onto live plan rows
--   2. makes the assistant plugin-cap trigger resilient to both naming schemes

SELECT set_config('app.current_tenant', 'admin', true);

-- Starter / Free → 2 plugins, 10 total tools
UPDATE public.plans
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{plugins_enabled}',
    'true'::jsonb,
    true
  ),
  limits = jsonb_set(
    jsonb_set(
      COALESCE(limits, '{}'::jsonb),
      '{max_plugins_per_assistant}',
      '2'::jsonb,
      true
    ),
    '{max_plugin_tools_total}',
    '10'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name IN ('free', 'starter');

-- Growth / Pro → 10 plugins, 50 total tools
UPDATE public.plans
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{plugins_enabled}',
    'true'::jsonb,
    true
  ),
  limits = jsonb_set(
    jsonb_set(
      COALESCE(limits, '{}'::jsonb),
      '{max_plugins_per_assistant}',
      '10'::jsonb,
      true
    ),
    '{max_plugin_tools_total}',
    '50'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name IN ('pro');

-- Scale / Business / Internal → unlimited plugins, unlimited plugin tools
UPDATE public.plans
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{plugins_enabled}',
    'true'::jsonb,
    true
  ),
  limits = jsonb_set(
    jsonb_set(
      COALESCE(limits, '{}'::jsonb),
      '{max_plugins_per_assistant}',
      '-1'::jsonb,
      true
    ),
    '{max_plugin_tools_total}',
    '-1'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name IN ('growth', 'business', 'internal');

CREATE OR REPLACE FUNCTION check_max_active_plugins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count INT;
  new_kind TEXT;
  assistant_org_id UUID;
  plan_name TEXT;
  plan_limits JSONB;
  plugin_limit INT;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT pc.kind INTO new_kind
  FROM org_plugin_installations opi
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE opi.id = NEW.installation_id;

  -- Integrations are managed separately and must not consume the plugin cap.
  IF COALESCE(new_kind, 'plugin') <> 'plugin' THEN
    RETURN NEW;
  END IF;

  SELECT aa.org_id INTO assistant_org_id
  FROM ai_assistants aa
  WHERE aa.id = NEW.assistant_id;

  SELECT p.name, p.limits INTO plan_name, plan_limits
  FROM subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.org_id = assistant_org_id
    AND s.status IN ('active', 'trialing')
    AND p.is_active = true
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF plan_limits IS NULL THEN
    SELECT p.name, p.limits INTO plan_name, plan_limits
    FROM public.plans p
    WHERE p.name IN ('starter', 'free')
      AND p.is_active = true
    ORDER BY CASE WHEN p.name = 'starter' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  plugin_limit := (plan_limits ->> 'max_plugins_per_assistant')::INT;

  IF plugin_limit IS NULL THEN
    plugin_limit := CASE COALESCE(plan_name, 'starter')
      WHEN 'free' THEN 2
      WHEN 'starter' THEN 2
      WHEN 'pro' THEN 10
      WHEN 'growth' THEN -1
      WHEN 'business' THEN -1
      WHEN 'internal' THEN -1
      ELSE 0
    END;
  END IF;

  IF plugin_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO active_count
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE apa.assistant_id = NEW.assistant_id
    AND apa.is_active = true
    AND pc.kind = 'plugin'
    AND apa.id IS DISTINCT FROM NEW.id;

  IF active_count >= plugin_limit THEN
    RAISE EXCEPTION 'Maximum % active plugins per assistant for current plan', plugin_limit;
  END IF;

  RETURN NEW;
END;
$$;
