-- Remove the redundant skill_catalog entry for Polymarket.
-- The SKILL.md lives at worker/src/skills/polymarket/SKILL.md (filesystem).
-- The plugin_catalog entry (20260326990000) is the single Polymarket card in the UI.
-- Migration 20260326930000 re-seeded this after 20260326920000 deleted it.

DELETE FROM assistant_skill_activations
WHERE installation_id IN (
  SELECT osi.id FROM org_skill_installations osi
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  WHERE sc.slug = 'polymarket'
);

DELETE FROM org_skill_installations
WHERE skill_id IN (SELECT id FROM skill_catalog WHERE slug = 'polymarket');

DELETE FROM skill_catalog WHERE slug = 'polymarket';
