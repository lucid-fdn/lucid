-- Knowledge entity/relationship graph
-- Adds canonical entities, aliases, and provenanced typed relationships on top
-- of Knowledge pages/events/sources. Retrieval can use this for bounded graph
-- expansion without adding a second memory or vector store.

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,

  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'person',
    'company',
    'project',
    'repo',
    'pull_request',
    'channel',
    'url',
    'agent',
    'decision',
    'integration',
    'topic'
  )),
  canonical_name TEXT NOT NULL CHECK (char_length(canonical_name) BETWEEN 1 AND 240),
  normalized_name TEXT NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 240),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'merged', 'archived', 'needs_review')),
  merged_into_entity_id UUID REFERENCES knowledge_entities(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.75 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_entities_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_entities_active_identity
  ON knowledge_entities(org_id, entity_type, normalized_name)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_project
  ON knowledge_entities(project_id, entity_type, updated_at DESC)
  WHERE project_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_team
  ON knowledge_entities(team_id, entity_type, updated_at DESC)
  WHERE team_id IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 240),
  normalized_alias TEXT NOT NULL CHECK (char_length(normalized_alias) BETWEEN 1 AND 240),
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.75 CHECK (confidence >= 0 AND confidence <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_entity_aliases_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_entity_aliases_active
  ON knowledge_entity_aliases(org_id, normalized_alias)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_entity_aliases_entity
  ON knowledge_entity_aliases(entity_id, created_at DESC)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  page_id UUID REFERENCES knowledge_pages(id) ON DELETE SET NULL,
  event_id UUID REFERENCES knowledge_events(id) ON DELETE SET NULL,

  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'mentions',
    'relates_to',
    'depends_on',
    'blocks',
    'owns',
    'uses',
    'decided',
    'produced_by',
    'supersedes',
    'handoff_to',
    'works_on'
  )),
  direction TEXT NOT NULL DEFAULT 'directed'
    CHECK (direction IN ('directed', 'bidirectional')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'needs_review')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_relationships_no_self_loop CHECK (source_entity_id <> target_entity_id),
  CONSTRAINT knowledge_relationships_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_relationships_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_relationships_active_identity
  ON knowledge_relationships(org_id, source_entity_id, target_entity_id, relation_type)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_source
  ON knowledge_relationships(source_entity_id, relation_type, confidence DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_target
  ON knowledge_relationships(target_entity_id, relation_type, confidence DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_project
  ON knowledge_relationships(project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND status = 'active';

DROP TRIGGER IF EXISTS trg_knowledge_entities_updated_at ON knowledge_entities;
CREATE TRIGGER trg_knowledge_entities_updated_at
  BEFORE UPDATE ON knowledge_entities
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_relationships_updated_at ON knowledge_relationships;
CREATE TRIGGER trg_knowledge_relationships_updated_at
  BEFORE UPDATE ON knowledge_relationships
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_entities_org_select ON knowledge_entities
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_entity_aliases_org_select ON knowledge_entity_aliases
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_relationships_org_select ON knowledge_relationships
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_entities_service_all ON knowledge_entities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_entity_aliases_service_all ON knowledge_entity_aliases
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_relationships_service_all ON knowledge_relationships
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
