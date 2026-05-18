-- Knowledge retrieval eval/capture spine.
-- Captures bounded, scrubbed query/result metadata for opt-in replay and drift
-- detection without storing raw prompts or creating another RAG/memory store.

CREATE TABLE IF NOT EXISTS knowledge_retrieval_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK (category IN (
    'preference',
    'project_fact',
    'org_policy',
    'source_conflict',
    'evidence_heavy'
  )),
  query TEXT NOT NULL CHECK (char_length(query) BETWEEN 1 AND 4000),
  expected_item_ids TEXT[] NOT NULL DEFAULT '{}',
  expected_citation_keys TEXT[] NOT NULL DEFAULT '{}',
  required_layers TEXT[] NOT NULL DEFAULT '{}',
  baseline_top_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_retrieval_eval_case_slug_unique UNIQUE (org_id, slug),
  CONSTRAINT knowledge_retrieval_eval_case_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  eval_case_id UUID REFERENCES knowledge_retrieval_eval_cases(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  surface TEXT NOT NULL DEFAULT 'runtime'
    CHECK (surface IN ('app_api', 'mission_control', 'worker_tool', 'mcp', 'agent_ops', 'external_agent', 'runtime')),
  query_hash TEXT NOT NULL,
  query_preview TEXT NOT NULL DEFAULT '',
  result_item_ids TEXT[] NOT NULL DEFAULT '{}',
  result_layers TEXT[] NOT NULL DEFAULT '{}',
  citation_keys TEXT[] NOT NULL DEFAULT '{}',
  expected_item_ids TEXT[] NOT NULL DEFAULT '{}',
  expected_citation_keys TEXT[] NOT NULL DEFAULT '{}',
  precision_at_k NUMERIC(5,4),
  recall_at_k NUMERIC(5,4),
  mrr NUMERIC(5,4),
  ndcg NUMERIC(5,4),
  citation_accuracy NUMERIC(5,4),
  top1_stable BOOLEAN,
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  baseline_latency_ms INTEGER,
  latency_delta_ms INTEGER,
  failure_types TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_retrieval_capture_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed')),
  case_count INTEGER NOT NULL DEFAULT 0 CHECK (case_count >= 0),
  precision_at_k NUMERIC(5,4),
  recall_at_k NUMERIC(5,4),
  mrr NUMERIC(5,4),
  ndcg NUMERIC(5,4),
  citation_accuracy NUMERIC(5,4),
  top1_stability NUMERIC(5,4),
  avg_latency_ms INTEGER,
  failure_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT knowledge_retrieval_run_failure_counts_object CHECK (jsonb_typeof(failure_counts) = 'object'),
  CONSTRAINT knowledge_retrieval_run_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  eval_run_id UUID NOT NULL REFERENCES knowledge_retrieval_eval_runs(id) ON DELETE CASCADE,
  eval_case_id UUID REFERENCES knowledge_retrieval_eval_cases(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning', 'skipped')),
  precision_at_k NUMERIC(5,4),
  recall_at_k NUMERIC(5,4),
  mrr NUMERIC(5,4),
  ndcg NUMERIC(5,4),
  citation_accuracy NUMERIC(5,4),
  top1_stable BOOLEAN,
  latency_ms INTEGER,
  failure_types TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_retrieval_result_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_retrieval_cases_org_status
  ON knowledge_retrieval_eval_cases(org_id, status, category, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_retrieval_captures_org_created
  ON knowledge_retrieval_captures(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_retrieval_captures_case_created
  ON knowledge_retrieval_captures(eval_case_id, created_at DESC)
  WHERE eval_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_retrieval_eval_runs_org_created
  ON knowledge_retrieval_eval_runs(org_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_knowledge_retrieval_eval_cases_updated_at ON knowledge_retrieval_eval_cases;
CREATE TRIGGER trg_knowledge_retrieval_eval_cases_updated_at
  BEFORE UPDATE ON knowledge_retrieval_eval_cases
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_retrieval_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_retrieval_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_retrieval_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_retrieval_eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_retrieval_eval_cases_org_select ON knowledge_retrieval_eval_cases
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_retrieval_captures_org_select ON knowledge_retrieval_captures
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_retrieval_eval_runs_org_select ON knowledge_retrieval_eval_runs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_retrieval_eval_results_org_select ON knowledge_retrieval_eval_results
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_retrieval_eval_cases_service_all ON knowledge_retrieval_eval_cases
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY knowledge_retrieval_captures_service_all ON knowledge_retrieval_captures
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY knowledge_retrieval_eval_runs_service_all ON knowledge_retrieval_eval_runs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY knowledge_retrieval_eval_results_service_all ON knowledge_retrieval_eval_results
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
