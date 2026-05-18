-- Remove the standalone 'polymarket' plugin from plugin_catalog.
-- Polymarket tools (polymarket_trade, lucid_hedge, polymarket_automation) are
-- built-in tools gated by capabilities (execute:predictions, reason:hedge),
-- NOT by plugin activation. They already appear under the 'platform-trading'
-- Core Skills bundle in the Unified Skills UI.
-- The 'polymarket' skill in skill_catalog (playbook/guide) is the correct
-- single entry for Polymarket in the UI.

-- Cascade: activations → installations → catalog
DELETE FROM assistant_plugin_activations
WHERE installation_id IN (
  SELECT opi.id FROM org_plugin_installations opi
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE pc.slug = 'polymarket'
);

DELETE FROM org_plugin_installations
WHERE plugin_id IN (SELECT id FROM plugin_catalog WHERE slug = 'polymarket');

DELETE FROM plugin_catalog WHERE slug = 'polymarket';
