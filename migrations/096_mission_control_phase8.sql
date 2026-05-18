-- Mission Control Phase 8: A/B Testing + Experiments

-- ─── Experiments ───
CREATE TABLE IF NOT EXISTS mc_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  base_agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  variant_agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  split_pct INT DEFAULT 50 CHECK (split_pct BETWEEN 1 AND 99),
  variable_type TEXT NOT NULL,       -- model | system_prompt | temperature | tools
  variable_config JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft',       -- draft | running | paused | completed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  winner TEXT,                       -- base | variant | inconclusive
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_experiments_org ON mc_experiments
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── Experiment Assignments ───
-- Deterministic hash-based routing of users to variants
CREATE TABLE IF NOT EXISTS mc_experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES mc_experiments(id),
  scoped_user_id TEXT NOT NULL,
  variant TEXT NOT NULL,             -- base | variant
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (experiment_id, scoped_user_id)
);

ALTER TABLE mc_experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_assignments_org ON mc_experiment_assignments
  FOR ALL USING (experiment_id IN (
    SELECT id FROM mc_experiments WHERE org_id IN (
      SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
    )
  ));

-- ─── RPC: Experiment results ───
CREATE OR REPLACE FUNCTION mc_experiment_results(p_experiment_id UUID, p_org_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'experiment', (
      SELECT row_to_json(e) FROM mc_experiments e
      WHERE e.id = p_experiment_id AND e.org_id = p_org_id
    ),
    'base_count', (
      SELECT COUNT(*) FROM mc_experiment_assignments
      WHERE experiment_id = p_experiment_id AND variant = 'base'
    ),
    'variant_count', (
      SELECT COUNT(*) FROM mc_experiment_assignments
      WHERE experiment_id = p_experiment_id AND variant = 'variant'
    ),
    'total_assignments', (
      SELECT COUNT(*) FROM mc_experiment_assignments
      WHERE experiment_id = p_experiment_id
    )
  );
$$;
