-- Rename integration slugs to remove "nango-" prefix.
-- Wire tool names derive from slugs (e.g. nango_slack__send_message → slack__send_message).
-- "Nango" is an internal transport detail — never user-facing.
--
-- Cascades through FK: org_plugin_installations.plugin_id, assistant_plugin_activations.installation_id
-- (both reference plugin_catalog.id, not slug — so slug rename is safe)

UPDATE plugin_catalog SET slug = 'slack'   WHERE slug = 'nango-slack';
UPDATE plugin_catalog SET slug = 'notion'  WHERE slug = 'nango-notion';
UPDATE plugin_catalog SET slug = 'google'  WHERE slug = 'nango-google';
UPDATE plugin_catalog SET slug = 'twitter' WHERE slug = 'nango-twitter';
