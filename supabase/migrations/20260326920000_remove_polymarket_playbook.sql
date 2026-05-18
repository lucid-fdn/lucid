-- Remove standalone Polymarket playbook — guidance is delivered via the plugin's
-- skill content at runtime (fetched by fetchActiveSkills), not as a separate card.
-- Having both a plugin card and a playbook card for the same brand is confusing UX.

DELETE FROM assistant_skill_activations
WHERE installation_id IN (
  SELECT osi.id FROM org_skill_installations osi
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  WHERE sc.slug = 'polymarket'
);
DELETE FROM org_skill_installations
WHERE skill_id IN (SELECT id FROM skill_catalog WHERE slug = 'polymarket');
DELETE FROM skill_catalog WHERE slug = 'polymarket';
