-- Knowledge Team/Project Brain MVP
-- Canonical compiled-truth + append-only timeline layer over existing
-- crews, Agent Ops, RAG, board memory, and Mission Control evidence.

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,

  source_type TEXT NOT NULL CHECK (source_type IN (
    'channel',
    'file',
    'repo',
    'url',
    'run',
    'manual',
    'project',
    'team',
    'org',
    'engine_home',
    'agent_ops',
    'board_memory'
  )),
  source_ref TEXT,
  label TEXT,
  visibility TEXT NOT NULL DEFAULT 'project'
    CHECK (visibility IN ('private', 'team', 'project', 'org', 'federated')),
  trust_level TEXT NOT NULL DEFAULT 'observed'
    CHECK (trust_level IN ('unverified', 'observed', 'operator_approved', 'system', 'l2_verified')),
  federation_policy TEXT NOT NULL DEFAULT 'source_scoped'
    CHECK (federation_policy IN ('isolated', 'source_scoped', 'org_federated')),
  retention_policy TEXT NOT NULL DEFAULT 'standard'
    CHECK (retention_policy IN ('ephemeral', 'standard', 'audit', 'legal_hold')),

  source_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_sources_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_sources_key
  ON knowledge_sources(org_id, source_key);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_project
  ON knowledge_sources(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_team
  ON knowledge_sources(team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,

  scope_type TEXT NOT NULL CHECK (scope_type IN ('project', 'team', 'org')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 240),
  slug TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 160),
  compiled_truth TEXT NOT NULL CHECK (char_length(compiled_truth) BETWEEN 1 AND 20000),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'archived')),
  trust_level TEXT NOT NULL DEFAULT 'observed'
    CHECK (trust_level IN ('unverified', 'observed', 'operator_approved', 'system', 'l2_verified')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (confidence >= 0 AND confidence <= 1),
  content_hash TEXT NOT NULL,

  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rag_document_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_pages_scope_project CHECK (scope_type <> 'project' OR project_id IS NOT NULL),
  CONSTRAINT knowledge_pages_scope_team CHECK (scope_type <> 'team' OR team_id IS NOT NULL),
  CONSTRAINT knowledge_pages_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_pages_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_pages_active_project_slug
  ON knowledge_pages(org_id, project_id, slug)
  WHERE status = 'active' AND scope_type = 'project';
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_pages_active_team_slug
  ON knowledge_pages(org_id, team_id, slug)
  WHERE status = 'active' AND scope_type = 'team';
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_pages_active_org_slug
  ON knowledge_pages(org_id, slug)
  WHERE status = 'active' AND scope_type = 'org';
CREATE INDEX IF NOT EXISTS idx_knowledge_pages_project_updated
  ON knowledge_pages(project_id, updated_at DESC)
  WHERE project_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_pages_team_updated
  ON knowledge_pages(team_id, updated_at DESC)
  WHERE team_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_pages_org_updated
  ON knowledge_pages(org_id, updated_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS knowledge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  page_id UUID REFERENCES knowledge_pages(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'created',
    'updated',
    'corrected',
    'superseded',
    'archived',
    'seeded'
  )),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  patch TEXT,
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_events_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_events_page
  ON knowledge_events(page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_events_project
  ON knowledge_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_events_team
  ON knowledge_events(team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES knowledge_pages(id) ON DELETE CASCADE,
  event_id UUID REFERENCES knowledge_events(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  compiled_truth TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_page
  ON knowledge_versions(page_id, version_number DESC);

CREATE OR REPLACE FUNCTION touch_knowledge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_sources_updated_at ON knowledge_sources;
CREATE TRIGGER trg_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_pages_updated_at ON knowledge_pages;
CREATE TRIGGER trg_knowledge_pages_updated_at
  BEFORE UPDATE ON knowledge_pages
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_sources_org_select ON knowledge_sources
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_pages_org_select ON knowledge_pages
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_events_org_select ON knowledge_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_versions_org_select ON knowledge_versions
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_sources_service_all ON knowledge_sources
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_pages_service_all ON knowledge_pages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_events_service_all ON knowledge_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_versions_service_all ON knowledge_versions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
