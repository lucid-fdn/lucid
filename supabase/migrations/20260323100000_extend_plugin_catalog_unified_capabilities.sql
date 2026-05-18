-- Migration: Extend plugin_catalog for Unified Capability Architecture
-- RFC: docs/plans/2026-03-23-unified-capability-architecture-rfc.md
--
-- ADDITIVE ONLY — no existing columns modified, no data deleted.
-- All new columns have safe defaults (least-privileged posture).
-- Existing code continues to work unchanged via the original 'source' column.

-- =============================================================================
-- Step 1: Add new columns to plugin_catalog
-- =============================================================================

-- UX distinction: plugin (tools only) vs integration (external SaaS + auth)
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'plugin'
    CHECK (kind IN ('plugin', 'integration'));

-- How tools are delivered. Defaults to remote-mcp (safest — goes through gateway).
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS transport TEXT NOT NULL DEFAULT 'remote-mcp'
    CHECK (transport IN ('embedded', 'remote-mcp', 'rest'));

-- Source trust level. Defaults to community (least privileged).
-- Promotion to 'internal' or 'verified' requires explicit review.
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS trust_level TEXT NOT NULL DEFAULT 'community'
    CHECK (trust_level IN ('internal', 'verified', 'community'));

-- Where the plugin runs. Defaults to gateway (isolated).
-- Policy in capability-core may override this at runtime.
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'gateway'
    CHECK (execution_mode IN ('in_process', 'gateway'));

-- Credential type needed for execution.
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'none'
    CHECK (auth_type IN ('none', 'oauth2', 'api-key', 'env-var'));

-- Nango provider key (oauth2), credential store key (api-key), or env prefix (env-var).
-- NULL when auth_type = 'none'.
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS auth_provider TEXT;

-- Partner branding (for kits and marketplace)
ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS partner_id TEXT;

ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS partner_branding JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN plugin_catalog.kind IS 'UX distinction: plugin (tools only) vs integration (external SaaS + auth)';
COMMENT ON COLUMN plugin_catalog.transport IS 'How tools are delivered: embedded (in-process MCP), remote-mcp (MCPGate HTTP), rest (direct HTTP API). Defaults to remote-mcp (safest).';
COMMENT ON COLUMN plugin_catalog.trust_level IS 'Source trust: internal (Lucid-owned), verified (reviewed partner), community (unreviewed). Defaults to community (least privileged).';
COMMENT ON COLUMN plugin_catalog.execution_mode IS 'Where it runs: in_process (SDK) or gateway (MCPGate service). Defaults to gateway (isolated). Policy may override at runtime.';
COMMENT ON COLUMN plugin_catalog.auth_type IS 'Credential type needed: none, oauth2 (Nango), api-key (encrypted store), env-var (self-hosted)';
COMMENT ON COLUMN plugin_catalog.auth_provider IS 'Nango provider key, credential store key, or env prefix. NULL when auth_type=none.';
COMMENT ON COLUMN plugin_catalog.partner_id IS 'Partner identifier for marketplace branding';
COMMENT ON COLUMN plugin_catalog.partner_branding IS 'Partner branding: { name, logo_url, badge, color, website }';

-- =============================================================================
-- Step 2: Backfill existing plugins with correct trust/execution values
-- =============================================================================

-- All 19 first-party embedded plugins: explicitly promote to internal + in_process
-- These are the Lucid-owned MCP servers that run via InMemoryTransport.
UPDATE plugin_catalog SET
  kind = 'plugin',
  transport = 'embedded',
  trust_level = 'internal',
  execution_mode = 'in_process',
  auth_type = 'none'
WHERE source = 'first-party'
  AND slug IN (
    'lucid-trade', 'lucid-predict', 'lucid-quantum', 'lucid-seo', 'lucid-audit',
    'lucid-tax', 'lucid-veille', 'lucid-hype', 'lucid-compete', 'lucid-prospect',
    'lucid-recruit', 'lucid-bridge', 'lucid-meet', 'lucid-invoice', 'lucid-propose',
    'lucid-metrics', 'lucid-feedback', 'lucid-video', 'lucid-observability'
  );

-- Any existing MCPGate community plugins: ensure they stay community + gateway
UPDATE plugin_catalog SET
  kind = 'plugin',
  transport = 'remote-mcp',
  trust_level = 'community',
  execution_mode = 'gateway',
  auth_type = 'none'
WHERE source = 'mcpgate';

-- =============================================================================
-- Step 3: Indexes for new columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_plugin_catalog_kind ON plugin_catalog(kind);
CREATE INDEX IF NOT EXISTS idx_plugin_catalog_trust ON plugin_catalog(trust_level);
CREATE INDEX IF NOT EXISTS idx_plugin_catalog_transport ON plugin_catalog(transport);

-- =============================================================================
-- Step 4: Extend get_assistant_active_plugins RPC to return new fields
-- =============================================================================

-- DROP and recreate to add new return columns.
-- This is safe because:
--   1. The function is called via supabase.rpc() which maps columns by name
--   2. New columns are ADDITIVE — existing callers that destructure specific fields
--      will continue to work (extra fields are ignored)
--   3. The worker reads source/mcpgate_server_id today — those columns still returned

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
  -- New unified capability columns
  kind               TEXT,
  transport          TEXT,
  trust_level        TEXT,
  execution_mode     TEXT,
  auth_type          TEXT,
  auth_provider      TEXT
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
    pc.auth_provider
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE apa.assistant_id = p_assistant_id
    AND apa.is_active = true
    AND pc.is_published = true;
$$;

GRANT EXECUTE ON FUNCTION get_assistant_active_plugins TO service_role;
