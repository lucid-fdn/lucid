-- Restore Polymarket plugin bundle in plugin_catalog.
-- Previously deleted by 20260326950000. Polymarket needs a plugin_catalog entry
-- so it shows in the Unified Skills UI with its tools.
-- The SKILL.md lives at worker/src/skills/polymarket/SKILL.md (runtime delivery).
-- No skill_catalog entry needed — same pattern as Hyperliquid.

-- 1. Seed plugin_catalog entry
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'polymarket',
  'Polymarket',
  'Trade on Polymarket prediction markets. Market search, orderbook analysis, position management, automated stop-loss/take-profit rules, portfolio hedge analysis, and prediction analytics.',
  '6.0.0', 'trading', 'plugin', 'embedded', 'internal',
  'in_process', 'none', 'first-party', true, true,
  '[{"name":"polymarket_trade","description":"Trade on Polymarket prediction markets (10 actions: search, market_info, orderbook, buy_yes, buy_no, sell_yes, sell_no, split_and_sell, open_orders, cancel_order).","parameters":{"type":"object","properties":{"action":{"type":"string"},"conditionId":{"type":"string"},"amount":{"type":"string"},"limitPrice":{"type":"string"}},"required":["action"]}},{"name":"polymarket_automation","description":"Rule-based automation for prediction positions (stop_loss, take_profit, trailing_stop, time_exit, portfolio rules).","parameters":{"type":"object","properties":{"action":{"type":"string"}},"required":["action"]}},{"name":"lucid_hedge","description":"Hedge analysis for prediction positions (analyze_position, analyze_portfolio, suggest_hedge).","parameters":{"type":"object","properties":{"action":{"type":"string"}},"required":["action"]}}]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  tool_manifest = EXCLUDED.tool_manifest;

-- 2. Auto-install for existing wallet-enabled orgs
INSERT INTO org_plugin_installations (org_id, plugin_id, installed_version, config, manifest_snapshot)
SELECT DISTINCT aa.org_id, pc.id, 1, '{}'::jsonb, pc.tool_manifest
FROM ai_assistants aa CROSS JOIN plugin_catalog pc
WHERE aa.wallet_enabled = true AND aa.org_id IS NOT NULL AND pc.slug = 'polymarket'
ON CONFLICT (org_id, plugin_id) DO NOTHING;

-- 3. Auto-activate on wallet-enabled assistants
INSERT INTO assistant_plugin_activations (assistant_id, installation_id, enabled_tools, is_active)
SELECT aa.id, opi.id,
  ARRAY['polymarket_trade', 'polymarket_automation', 'lucid_hedge'],
  true
FROM ai_assistants aa
JOIN org_plugin_installations opi ON opi.org_id = aa.org_id
JOIN plugin_catalog pc ON pc.id = opi.plugin_id
WHERE aa.wallet_enabled = true AND pc.slug = 'polymarket'
ON CONFLICT (assistant_id, installation_id) DO NOTHING;
