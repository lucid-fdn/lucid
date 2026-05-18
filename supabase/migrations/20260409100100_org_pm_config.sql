-- ============================================================================
-- PM External Adapter — Chunk 1: org_pm_config
--
-- Per-org configuration for each external PM provider. Holds:
--   - enabled flag (master switch per provider per org)
--   - Nango connection id (auth delegation)
--   - provider-specific config (team id, board id, project id, ...)
--   - inbound webhook secret (HMAC verification)
--
-- One org may have multiple provider configs enabled simultaneously, but
-- only one row can be flagged is_primary=true — that is the "default"
-- destination when the sync worker has no explicit hint.
--
-- Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.4
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_pm_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider identity
  provider TEXT NOT NULL
    CHECK (provider IN ('linear', 'asana', 'trello', 'monday', 'jira')),

  -- Lifecycle
  enabled BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,

  -- Nango connection that carries the OAuth tokens. Always required — we
  -- never handle raw API keys in the adapter layer.
  nango_connection_id TEXT NOT NULL
    CHECK (char_length(nango_connection_id) BETWEEN 1 AND 200),

  -- Provider-specific config: team_id, project_id, board_id, list_id,
  -- workspace_slug, default_label, etc. Never holds secrets.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Inbound webhook HMAC secret. Nullable because some providers (Trello)
  -- do not support signed webhooks and fall back to IP allowlisting.
  webhook_secret TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One config row per (org, provider). Reconnecting updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_pm_config_org_provider
  ON org_pm_config(org_id, provider);

-- At most one primary provider per org. Partial unique index enforces it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_pm_config_primary
  ON org_pm_config(org_id)
  WHERE is_primary = true;

-- Fast "which orgs use provider X" lookup for reconcile batching.
CREATE INDEX IF NOT EXISTS idx_org_pm_config_provider_enabled
  ON org_pm_config(provider)
  WHERE enabled = true;

-- RLS: org-scoped via organization_members
ALTER TABLE org_pm_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_pm_config_org_isolation ON org_pm_config;
CREATE POLICY org_pm_config_org_isolation ON org_pm_config
  FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- updated_at trigger
CREATE OR REPLACE FUNCTION org_pm_config_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_pm_config_updated_at ON org_pm_config;
CREATE TRIGGER org_pm_config_updated_at
  BEFORE UPDATE ON org_pm_config
  FOR EACH ROW EXECUTE FUNCTION org_pm_config_touch_updated_at();

COMMENT ON TABLE org_pm_config IS
  'Per-org configuration for external PM providers (Linear, Asana, Trello, Monday, Jira). One row per (org, provider). Holds Nango connection + provider-specific config + inbound webhook secret.';
COMMENT ON COLUMN org_pm_config.is_primary IS
  'At most one provider per org may be flagged primary. The sync worker uses the primary when no explicit destination is set on the work item.';
COMMENT ON COLUMN org_pm_config.webhook_secret IS
  'HMAC secret for verifying inbound webhook signatures. Nullable for providers that do not sign (e.g., Trello relies on IP allowlisting).';
