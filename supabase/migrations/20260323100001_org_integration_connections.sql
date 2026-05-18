-- Migration: org_integration_connections + active_connection_id FK
-- RFC: docs/plans/2026-03-23-unified-capability-architecture-rfc.md
--
-- Separates OAuth/API connection records from plugin install state.
-- Supports: multi-account, reconnect history, revocation, scope tracking.
-- ADDITIVE ONLY — no existing tables or columns modified destructively.

-- =============================================================================
-- Table: org_integration_connections
-- =============================================================================

CREATE TABLE org_integration_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id        UUID NOT NULL REFERENCES plugin_catalog(id) ON DELETE CASCADE,

  -- Nango connection identity
  connection_id    TEXT NOT NULL,          -- Nango connectionId (unique per connection)
  auth_provider    TEXT NOT NULL,          -- Nango provider config key (e.g., 'slack')

  -- Connection state
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  scopes           TEXT[] DEFAULT '{}',    -- OAuth scopes granted
  account_label    TEXT,                   -- User-friendly label ("Acme Corp Slack")
  account_id       TEXT,                   -- External account identifier (workspace ID, etc.)

  -- Lifecycle
  connected_at     TIMESTAMPTZ DEFAULT now(),
  connected_by     UUID REFERENCES profiles(id),
  expires_at       TIMESTAMPTZ,            -- Token expiry (if known from Nango)
  last_used_at     TIMESTAMPTZ,
  disconnected_at  TIMESTAMPTZ,

  -- Metadata
  metadata         JSONB DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Unique: one Nango connection ID per org (prevents duplicate connections)
CREATE UNIQUE INDEX idx_oic_org_connection
  ON org_integration_connections (org_id, connection_id);

-- Lookup: active connections for an org + plugin
CREATE INDEX idx_oic_org_plugin_active
  ON org_integration_connections (org_id, plugin_id)
  WHERE status = 'active';

-- Lookup: by plugin for cleanup/admin
CREATE INDEX idx_oic_plugin_id
  ON org_integration_connections (plugin_id);

-- Comments
COMMENT ON TABLE org_integration_connections IS 'OAuth/API connections for integrations. Separate from install state — supports multi-account, reconnect, revocation.';
COMMENT ON COLUMN org_integration_connections.connection_id IS 'Nango connectionId. Unique per org.';
COMMENT ON COLUMN org_integration_connections.auth_provider IS 'Nango provider config key (e.g., slack, hubspot, notion)';
COMMENT ON COLUMN org_integration_connections.status IS 'Connection health: active, expired, revoked, error';
COMMENT ON COLUMN org_integration_connections.account_label IS 'User-friendly label for multi-account disambiguation';
COMMENT ON COLUMN org_integration_connections.account_id IS 'External account/workspace ID from the provider';

-- =============================================================================
-- RLS: org-scoped via organization_members
-- =============================================================================

ALTER TABLE org_integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view connections"
  ON org_integration_connections FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage connections"
  ON org_integration_connections FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can update connections"
  ON org_integration_connections FOR UPDATE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can delete connections"
  ON org_integration_connections FOR DELETE
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_oic_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_oic_updated_at
  BEFORE UPDATE ON org_integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_oic_updated_at();

-- =============================================================================
-- Extend org_plugin_installations: soft FK to active connection
-- =============================================================================

ALTER TABLE org_plugin_installations
  ADD COLUMN IF NOT EXISTS active_connection_id UUID
    REFERENCES org_integration_connections(id) ON DELETE SET NULL;

COMMENT ON COLUMN org_plugin_installations.active_connection_id IS 'Currently active OAuth/API connection for this integration install. NULL for non-integration plugins. Soft FK — install survives connection changes.';

-- =============================================================================
-- Service role grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON org_integration_connections TO service_role;
GRANT SELECT ON org_integration_connections TO authenticated;
