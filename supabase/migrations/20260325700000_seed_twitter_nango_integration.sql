-- Migration: Seed Twitter/X Nango integration into plugin_catalog
--
-- Twitter v2 actions are already deployed on the Nango server.
-- This seeds the catalog entry so the UI can discover and install it.

INSERT INTO plugin_catalog (
  slug, name, description, version, category,
  tool_manifest, source, risk_level, verified, max_tools, is_published,
  kind, transport, trust_level, execution_mode, auth_type, auth_provider
) VALUES
  ('nango-twitter', 'Twitter / X', 'Post tweets, search, and manage your Twitter/X presence.',
   '1.0.0', 'communication',
   '[]'::jsonb, 'first-party', 'write', true, 20, true,
   'integration', 'nango', 'verified', 'in_process', 'oauth2', 'twitter-v2')
ON CONFLICT (slug) DO UPDATE SET
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  auth_provider = EXCLUDED.auth_provider,
  updated_at = now();
