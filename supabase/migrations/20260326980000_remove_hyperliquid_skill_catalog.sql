-- Remove the redundant skill_catalog entry for Hyperliquid.
-- The SKILL.md lives at worker/src/skills/hyperliquid/SKILL.md (filesystem).
-- The plugin_catalog entry (20260326970000) is the single Hyperliquid card in the UI.
-- Cascade: activations → installations → catalog entry.

DELETE FROM assistant_skill_activations
WHERE installation_id IN (
  SELECT osi.id FROM org_skill_installations osi
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  WHERE sc.slug = 'hyperliquid'
);

DELETE FROM org_skill_installations
WHERE skill_id IN (SELECT id FROM skill_catalog WHERE slug = 'hyperliquid');

DELETE FROM skill_catalog WHERE slug = 'hyperliquid';
