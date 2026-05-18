-- EHV/HHV/OHV projection candidates.
-- Engine homes remain engine-native and local-authoritative when configured so.
-- This ledger only stores redacted summaries/provenance for review and optional
-- promotion into Lucid Knowledge.

CREATE TABLE IF NOT EXISTS knowledge_engine_home_projection_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,

  engine TEXT NOT NULL CHECK (engine IN ('openclaw', 'hermes', 'langchain', 'crewai', 'autogen', 'smolagents', 'lucid')),
  home_kind TEXT NOT NULL CHECK (home_kind IN ('hermes_hhv', 'openclaw_ohv', 'generic_ehv')),
  home_authority TEXT NOT NULL CHECK (home_authority IN ('local_authoritative', 'lucid_authoritative', 'evaluation_only')),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('memory', 'user_profile', 'local_skill', 'config', 'session', 'cache', 'migration', 'unknown')),
  projection_policy TEXT NOT NULL CHECK (projection_policy IN (
    'ignore',
    'searchable_summary',
    'candidate_only',
    'promote_to_assistant_memory',
    'promote_to_team_brain',
    'promote_to_project_brain',
    'export_only'
  )),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'promoted', 'rejected', 'ignored')),

  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 500),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) BETWEEN 16 AND 160),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 2000),
  payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_id TEXT NOT NULL,
  source_diff_id TEXT,
  promotion_target_type TEXT CHECK (promotion_target_type IN ('assistant_memory', 'team_brain', 'project_brain')),
  promotion_target_id TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_ehv_candidate_payload_object CHECK (jsonb_typeof(payload_redacted) = 'object'),
  CONSTRAINT knowledge_ehv_candidate_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_ehv_candidates_source_hash
  ON knowledge_engine_home_projection_candidates(org_id, engine, source_snapshot_id, path, content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_ehv_candidates_org_status
  ON knowledge_engine_home_projection_candidates(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_ehv_candidates_project_status
  ON knowledge_engine_home_projection_candidates(project_id, status, created_at DESC)
  WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_knowledge_ehv_candidates_updated_at ON knowledge_engine_home_projection_candidates;
CREATE TRIGGER trg_knowledge_ehv_candidates_updated_at
  BEFORE UPDATE ON knowledge_engine_home_projection_candidates
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_engine_home_projection_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_ehv_candidates_org_select ON knowledge_engine_home_projection_candidates
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_ehv_candidates_service_all ON knowledge_engine_home_projection_candidates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
