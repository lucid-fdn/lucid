-- Align plugin activation limits with plan entitlements.
--
-- Problem:
--   The entitlement layer allows:
--   - starter  -> 0 plugins per assistant
--   - pro      -> 10 plugins per assistant
--   - business -> unlimited plugins per assistant
--
--   But the legacy DB trigger still hard-blocks all plugin activations at 5.
--   That makes the live backend disagree with both the entitlement engine and
--   the product pricing model.
--
-- Fix:
--   - keep integrations excluded from the plugin cap
--   - resolve the assistant org's active subscription plan limit from
--     subscriptions -> plans.limits
--   - fall back to the active starter plan limits if no subscription exists
--   - enforce the plan-aware limit at the database layer

CREATE OR REPLACE FUNCTION check_max_active_plugins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count INT;
  new_kind TEXT;
  assistant_org_id UUID;
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

  -- Active/trialing subscription is authoritative when present.
  SELECT p.limits INTO plan_limits
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.org_id = assistant_org_id
    AND s.status IN ('active', 'trialing')
    AND p.is_active = true
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Fallback matches the app entitlement layer: no subscription => starter plan.
  IF plan_limits IS NULL THEN
    SELECT p.limits INTO plan_limits
    FROM plans p
    WHERE p.name = 'starter'
      AND p.is_active = true
    LIMIT 1;
  END IF;

  plugin_limit := COALESCE((plan_limits ->> 'max_plugins_per_assistant')::INT, 0);

  -- -1 means unlimited
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
