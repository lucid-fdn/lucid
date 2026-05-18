-- Migration: Add endpoint_url and fallback_mode to plugin_catalog
-- Separates REST endpoint URLs from mcpgate_server_id (which is MCP-only).
-- Adds explicit fallback gating (opt-in, not automatic).
--
-- ADDITIVE ONLY — no existing columns modified, no data deleted.

-- =============================================================================
-- Step 1: Add new columns
-- =============================================================================

-- Direct REST API base URL for transport='rest' plugins.
-- NULL for embedded and remote-mcp (they use mcpgate_server_id or in-process).
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS endpoint_url TEXT;

-- Explicit fallback policy when embedded execution fails.
-- NULL = no fallback (fail hard). 'gateway' = fall back to MCPGate.
-- Only meaningful for transport='embedded' plugins.
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT DEFAULT NULL
    CHECK (fallback_mode IS NULL OR fallback_mode = 'gateway');

COMMENT ON COLUMN plugin_catalog.endpoint_url IS 'Direct REST API base URL for transport=rest plugins. NULL for embedded/remote-mcp.';
COMMENT ON COLUMN plugin_catalog.fallback_mode IS 'Fallback when embedded execution fails: NULL = fail hard (default), gateway = fall back to MCPGate HTTP.';

-- =============================================================================
-- Step 2: Constraint — REST plugins must have an endpoint URL
-- =============================================================================

-- Use a named constraint so it's easy to find/drop if needed.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rest_requires_endpoint_url'
  ) THEN
    ALTER TABLE plugin_catalog
      ADD CONSTRAINT chk_rest_requires_endpoint_url
      CHECK (transport != 'rest' OR endpoint_url IS NOT NULL);
  END IF;
END $$;

-- =============================================================================
-- Step 3: Extend get_assistant_active_plugins RPC
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
  -- New columns
  endpoint_url       TEXT,
  fallback_mode      TEXT
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
    pc.fallback_mode
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE apa.assistant_id = p_assistant_id
    AND apa.is_active = true
    AND pc.is_published = true;
$$;

GRANT EXECUTE ON FUNCTION get_assistant_active_plugins TO service_role;
