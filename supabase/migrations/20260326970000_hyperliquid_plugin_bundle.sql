-- Hyperliquid plugin bundle in plugin_catalog.
-- Makes Hyperliquid appear as an activatable skill with real tools in Unified Skills UI.
-- Mirrors the polymarket pattern: plugin_catalog (tools) + skill_catalog (guide).
-- Tools are built-in (BuiltInToolExecutor), capability-gated by execute:perpetuals.

-- 1. Seed plugin_catalog entry
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'hyperliquid',
  'Hyperliquid',
  'Trade perpetual futures on Hyperliquid. Up to 50x leverage, cross-margin, 100+ markets. Account info, order placement, and order cancellation.',
  '1.0.0', 'trading', 'plugin', 'embedded', 'internal',
  'in_process', 'none', 'first-party', true, true,
  '[{"name":"hl_account_info","description":"Get Hyperliquid account state: positions, balances, margin, open orders.","parameters":{"type":"object","properties":{"walletAddress":{"type":"string"}},"required":["walletAddress"]}},{"name":"hl_place_order","description":"Place a perpetual order on Hyperliquid (market or limit, up to 50x leverage).","parameters":{"type":"object","properties":{"market":{"type":"string"},"side":{"type":"string","enum":["long","short"]},"size":{"type":"string"},"orderType":{"type":"string","enum":["market","limit"]},"price":{"type":"string"},"reduceOnly":{"type":"boolean"},"leverage":{"type":"number"}},"required":["market","side","size","orderType"]}},{"name":"hl_cancel_order","description":"Cancel an open order on Hyperliquid.","parameters":{"type":"object","properties":{"orderId":{"type":"string"},"market":{"type":"string"}},"required":["orderId","market"]}}]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  tool_manifest = EXCLUDED.tool_manifest;

-- 2. Auto-install for existing wallet-enabled orgs
INSERT INTO org_plugin_installations (org_id, plugin_id, installed_version, config, manifest_snapshot)
SELECT DISTINCT aa.org_id, pc.id, 1, '{}'::jsonb, pc.tool_manifest
FROM ai_assistants aa CROSS JOIN plugin_catalog pc
WHERE aa.wallet_enabled = true AND aa.org_id IS NOT NULL AND pc.slug = 'hyperliquid'
ON CONFLICT (org_id, plugin_id) DO NOTHING;

-- 3. Auto-activate on wallet-enabled assistants
INSERT INTO assistant_plugin_activations (assistant_id, installation_id, enabled_tools, is_active)
SELECT aa.id, opi.id,
  ARRAY['hl_account_info', 'hl_place_order', 'hl_cancel_order'],
  true
FROM ai_assistants aa
JOIN org_plugin_installations opi ON opi.org_id = aa.org_id
JOIN plugin_catalog pc ON pc.id = opi.plugin_id
WHERE aa.wallet_enabled = true AND pc.slug = 'hyperliquid'
ON CONFLICT (assistant_id, installation_id) DO NOTHING;
