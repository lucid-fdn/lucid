-- Per-agent app account bindings.
--
-- Workspace/org connections are reusable credentials in org_integration_connections.
-- assistant_app_bindings selects which reusable account a specific assistant uses.
-- Runtime should prefer this table over org_plugin_installations.active_connection_id.

CREATE TABLE IF NOT EXISTS assistant_app_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  plugin_id UUID NOT NULL REFERENCES plugin_catalog(id) ON DELETE CASCADE,
  org_connection_id UUID REFERENCES org_integration_connections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'needs_connection', 'error')),
  enabled_actions TEXT[],
  requires_confirmation_actions TEXT[],
  max_calls_per_run INTEGER CHECK (max_calls_per_run IS NULL OR max_calls_per_run > 0),
  allowed_resources JSONB,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assistant_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS idx_aab_assistant_status
  ON assistant_app_bindings (assistant_id, status);

CREATE INDEX IF NOT EXISTS idx_aab_org_connection
  ON assistant_app_bindings (org_connection_id);

COMMENT ON TABLE assistant_app_bindings IS 'Per-agent selected app account/credential binding. Workspace connections are reusable; this table chooses which one each assistant uses.';
COMMENT ON COLUMN assistant_app_bindings.org_connection_id IS 'Selected reusable workspace connection. NULL means the app is selected but still needs connection/account choice.';

CREATE OR REPLACE FUNCTION update_assistant_app_bindings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aab_updated_at ON assistant_app_bindings;
CREATE TRIGGER trg_aab_updated_at
  BEFORE UPDATE ON assistant_app_bindings
  FOR EACH ROW EXECUTE FUNCTION update_assistant_app_bindings_updated_at();

ALTER TABLE assistant_app_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view assistant app bindings"
  ON assistant_app_bindings FOR SELECT
  USING (
    assistant_id IN (
      SELECT a.id
      FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org editors can manage assistant app bindings"
  ON assistant_app_bindings FOR ALL
  USING (
    assistant_id IN (
      SELECT a.id
      FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    assistant_id IN (
      SELECT a.id
      FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- Backfill from the older org-global active connection model. This is safe and
-- idempotent; it only creates bindings for active assistant plugin activations.
INSERT INTO assistant_app_bindings (
  assistant_id,
  plugin_id,
  org_connection_id,
  status,
  enabled_actions,
  config
)
SELECT
  apa.assistant_id,
  opi.plugin_id,
  opi.active_connection_id,
  CASE WHEN opi.active_connection_id IS NULL THEN 'needs_connection' ELSE 'active' END,
  apa.enabled_tools,
  COALESCE(apa.config, '{}'::jsonb)
FROM assistant_plugin_activations apa
JOIN org_plugin_installations opi ON opi.id = apa.installation_id
JOIN plugin_catalog pc ON pc.id = opi.plugin_id
WHERE apa.is_active = true
  AND pc.kind = 'integration'
ON CONFLICT (assistant_id, plugin_id) DO UPDATE
SET
  org_connection_id = COALESCE(assistant_app_bindings.org_connection_id, EXCLUDED.org_connection_id),
  status = CASE
    WHEN COALESCE(assistant_app_bindings.org_connection_id, EXCLUDED.org_connection_id) IS NULL THEN 'needs_connection'
    ELSE 'active'
  END,
  enabled_actions = COALESCE(assistant_app_bindings.enabled_actions, EXCLUDED.enabled_actions),
  config = assistant_app_bindings.config || EXCLUDED.config;

GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_app_bindings TO service_role;
GRANT SELECT ON assistant_app_bindings TO authenticated;
