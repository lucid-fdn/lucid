-- Enable a small plugin allowance on Starter so the tier feels real.
--
-- Product policy:
--   starter  -> 2 plugins per assistant
--   pro      -> 10 plugins per assistant
--   business -> unlimited plugins per assistant
--
-- Keep integrations separate; this only updates the starter plan's plugin
-- feature gate and plugin-related limits.

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
WHERE name = 'starter';
