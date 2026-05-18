-- Remove HubSpot and GitHub from plugin_catalog
-- These integrations are not needed at this time.

DELETE FROM plugin_catalog WHERE slug IN ('nango-hubspot', 'nango-github');
