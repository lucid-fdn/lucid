-- Migration: Unify Nango integrations into the plugin system
--
-- Nango integrations (OAuth-connected external services) now flow through
-- the same 3-tier plugin governance: plugin_catalog → org_plugin_installations
-- → assistant_plugin_activations.
--
-- Changes:
--   1. Add 'nango' to plugin_catalog.transport CHECK constraint
--   2. Extend get_assistant_active_plugins RPC to return connection_id
--      via LEFT JOIN on org_integration_connections
--   3. Seed initial Nango providers into plugin_catalog
--
-- This eliminates the need for assistant_oauth_bindings as a separate system.

-- =============================================================================
-- Step 1: Add 'nango' to transport CHECK constraint
-- =============================================================================

ALTER TABLE plugin_catalog DROP CONSTRAINT IF EXISTS plugin_catalog_transport_check;
ALTER TABLE plugin_catalog ADD CONSTRAINT plugin_catalog_transport_check
  CHECK (transport IN ('embedded', 'remote-mcp', 'rest', 'nango'));

-- =============================================================================
-- Step 2: Extend get_assistant_active_plugins RPC
-- =============================================================================

DROP FUNCTION IF EXISTS get_assistant_active_plugins(UUID);

CREATE OR REPLACE FUNCTION get_assistant_active_plugins(p_assistant_id UUID)
RETURNS TABLE (
  plugin_slug        TEXT,
  plugin_name        TEXT,
  tool_manifest      JSONB,
  enabled_tools      TEXT[],
  plugin_config      JSONB,
  org_config         JSONB,
  installed_version  TEXT,
  -- Original columns (kept for backwards compatibility)
  source             TEXT,
  mcpgate_server_id  TEXT,
  -- Unified capability columns
  kind               TEXT,
  transport          TEXT,
  trust_level        TEXT,
  execution_mode     TEXT,
  auth_type          TEXT,
  auth_provider      TEXT,
  -- Routing targets
  endpoint_url       TEXT,
  fallback_mode      TEXT,
  -- Connection data (NULL for non-integration plugins)
  connection_id      TEXT,
  connection_status  TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    pc.slug,
    pc.name,
    opi.manifest_snapshot,
    apa.enabled_tools,
    apa.config,
    opi.config,
    opi.installed_version,
    pc.source,
    pc.mcpgate_server_id,
    pc.kind,
    pc.transport,
    pc.trust_level,
    pc.execution_mode,
    pc.auth_type,
    pc.auth_provider,
    pc.endpoint_url,
    pc.fallback_mode,
    conn.connection_id,
    conn.status
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  LEFT JOIN org_integration_connections conn
    ON conn.id = opi.active_connection_id
    AND conn.status = 'active'
  WHERE apa.assistant_id = p_assistant_id
    AND apa.is_active = true
    AND pc.is_published = true;
$$;

GRANT EXECUTE ON FUNCTION get_assistant_active_plugins TO service_role;

-- =============================================================================
-- Step 3: Add endpoint_url and fallback_mode to plugin_catalog if missing
-- =============================================================================

ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS endpoint_url TEXT;

ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT
    CHECK (fallback_mode IS NULL OR fallback_mode IN ('gateway'));

-- =============================================================================
-- Step 4: Seed Nango integration providers into plugin_catalog
-- =============================================================================

INSERT INTO plugin_catalog (
  slug, name, description, version, category,
  tool_manifest, source, risk_level, verified, max_tools, is_published,
  kind, transport, trust_level, execution_mode, auth_type, auth_provider
) VALUES
  ('nango-slack', 'Slack', 'Send messages, manage channels, and collaborate in Slack workspaces.',
   '1.0.0', 'communication',
   '[]'::jsonb, 'first-party', 'write', true, 20, true,
   'integration', 'nango', 'verified', 'in_process', 'oauth2', 'slack'),

  ('nango-google', 'Google', 'Sheets, Calendar, Drive, and Gmail — read, write, and manage your Google workspace.',
   '1.0.0', 'productivity',
   '[]'::jsonb, 'first-party', 'write', true, 40, true,
   'integration', 'nango', 'verified', 'in_process', 'oauth2', 'google'),

  ('nango-notion', 'Notion', 'Search, create, and manage Notion pages and databases.',
   '1.0.0', 'productivity',
   '[]'::jsonb, 'first-party', 'write', true, 20, true,
   'integration', 'nango', 'verified', 'in_process', 'oauth2', 'notion')
ON CONFLICT (slug) DO UPDATE SET
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  auth_provider = EXCLUDED.auth_provider,
  updated_at = now();
