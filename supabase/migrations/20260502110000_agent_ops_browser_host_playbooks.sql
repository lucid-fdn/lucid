-- ============================================================================
-- Agent Ops Browser Host Playbooks
--
-- Host/domain knowledge for Browser Operator runs. These are Lucid-native
-- equivalents of domain skills: tenant-scoped, trust-state governed, and
-- injected as runtime-neutral planning context for any compatible engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_ops_browser_host_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  host_pattern TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project'
    CHECK (scope IN ('project', 'org', 'global_catalog')),
  trust_state TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (trust_state IN ('quarantined', 'active', 'deprecated', 'blocked')),

  successful_uses INTEGER NOT NULL DEFAULT 0 CHECK (successful_uses >= 0),
  security_flags_count INTEGER NOT NULL DEFAULT 0 CHECK (security_flags_count >= 0),
  last_used_at TIMESTAMPTZ,

  source_run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_ops_browser_host_playbooks_host_len CHECK (char_length(host_pattern) BETWEEN 1 AND 255),
  CONSTRAINT agent_ops_browser_host_playbooks_host_no_scheme CHECK (host_pattern NOT LIKE '%://%'),
  CONSTRAINT agent_ops_browser_host_playbooks_title_len CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT agent_ops_browser_host_playbooks_body_len CHECK (char_length(body_md) BETWEEN 1 AND 12000),
  CONSTRAINT agent_ops_browser_host_playbooks_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT agent_ops_browser_host_playbooks_scope_project_id CHECK (
    (scope = 'project' AND project_id IS NOT NULL)
    OR (scope IN ('org', 'global_catalog') AND project_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_host_playbooks_org_trust
  ON agent_ops_browser_host_playbooks(org_id, trust_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_host_playbooks_project_trust
  ON agent_ops_browser_host_playbooks(project_id, trust_state, updated_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_host_playbooks_host
  ON agent_ops_browser_host_playbooks(org_id, host_pattern, trust_state);

CREATE INDEX IF NOT EXISTS idx_agent_ops_browser_host_playbooks_source_run
  ON agent_ops_browser_host_playbooks(source_run_id)
  WHERE source_run_id IS NOT NULL;

ALTER TABLE agent_ops_browser_host_playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_ops_browser_host_playbooks_org_select ON agent_ops_browser_host_playbooks;
CREATE POLICY agent_ops_browser_host_playbooks_org_select ON agent_ops_browser_host_playbooks
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_host_playbooks_org_insert ON agent_ops_browser_host_playbooks;
CREATE POLICY agent_ops_browser_host_playbooks_org_insert ON agent_ops_browser_host_playbooks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_host_playbooks_org_update ON agent_ops_browser_host_playbooks;
CREATE POLICY agent_ops_browser_host_playbooks_org_update ON agent_ops_browser_host_playbooks
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_ops_browser_host_playbooks_service_all ON agent_ops_browser_host_playbooks;
CREATE POLICY agent_ops_browser_host_playbooks_service_all ON agent_ops_browser_host_playbooks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS touch_agent_ops_browser_host_playbooks_updated_at ON agent_ops_browser_host_playbooks;
CREATE TRIGGER touch_agent_ops_browser_host_playbooks_updated_at
  BEFORE UPDATE ON agent_ops_browser_host_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_ops_product_layer_updated_at();

CREATE OR REPLACE FUNCTION public.record_agent_ops_browser_host_playbook_use(
  p_playbook_id UUID,
  p_success BOOLEAN DEFAULT TRUE,
  p_security_flags_count INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_ops_browser_host_playbooks
  SET
    successful_uses = successful_uses + CASE WHEN p_success THEN 1 ELSE 0 END,
    security_flags_count = security_flags_count + GREATEST(COALESCE(p_security_flags_count, 0), 0),
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_playbook_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_ops_browser_host_playbook_use(UUID, BOOLEAN, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_agent_ops_browser_host_playbook_use(UUID, BOOLEAN, INTEGER) TO service_role;
