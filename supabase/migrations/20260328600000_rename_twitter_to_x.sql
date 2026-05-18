-- Migration: Rename Twitter → X in plugin_catalog
-- Twitter rebranded to X. Update display name and description.

UPDATE plugin_catalog
SET name = 'X',
    description = 'Post on X, search posts, and manage your X presence.',
    updated_at = now()
WHERE slug = 'twitter';
