-- Polymarket Unified Bundle: rename lucid-predict → polymarket, merge all tools.
-- One plugin card ("polymarket" in plugin_catalog) with 10 tools.
-- Trading/hedge guidance delivered at runtime via builtin-skills fetch pipeline.
-- Backward-compat: auto-install/activate for existing wallet-enabled assistants.
-- (wallet_enabled is the DB proxy for trading agents — trading_enabled is runtime-derived)

-- =============================================================================
-- 1. PLUGIN: Rename lucid-predict → polymarket and merge all tools into one entry.
-- =============================================================================
UPDATE plugin_catalog SET
  slug = 'polymarket',
  name = 'Polymarket',
  author = 'Lucid',
  description = 'Trade on Polymarket prediction markets. Market search, orderbook analysis, position management, automated stop-loss/take-profit rules, portfolio hedge analysis, and prediction analytics.',
  version = '6.0.0',
  tool_manifest = tool_manifest || '[{"name":"polymarket_trade","description":"Trade on Polymarket (10 actions)"},{"name":"polymarket_automation","description":"Rule-based automation for prediction positions"},{"name":"lucid_hedge","description":"Hedge analysis for prediction positions"}]'::jsonb
WHERE slug = 'lucid-predict';

-- =============================================================================
-- 2. PLUGIN: Auto-install + activate for wallet-enabled orgs/assistants
-- =============================================================================
INSERT INTO org_plugin_installations (org_id, plugin_id, installed_version, config, manifest_snapshot)
SELECT DISTINCT aa.org_id, pc.id, 1, '{}'::jsonb, pc.tool_manifest
FROM ai_assistants aa CROSS JOIN plugin_catalog pc
WHERE aa.wallet_enabled = true AND aa.org_id IS NOT NULL AND pc.slug = 'polymarket'
ON CONFLICT (org_id, plugin_id) DO NOTHING;

INSERT INTO assistant_plugin_activations (assistant_id, installation_id, enabled_tools, is_active)
SELECT aa.id, opi.id,
  ARRAY['lucid_evaluate', 'lucid_discover', 'lucid_arbitrage', 'lucid_correlate', 'lucid_size', 'lucid_calibrate', 'lucid_pro', 'polymarket_trade', 'polymarket_automation', 'lucid_hedge'],
  true
FROM ai_assistants aa
JOIN org_plugin_installations opi ON opi.org_id = aa.org_id
JOIN plugin_catalog pc ON pc.id = opi.plugin_id
WHERE aa.wallet_enabled = true AND pc.slug = 'polymarket'
ON CONFLICT (assistant_id, installation_id) DO NOTHING;
