-- Knowledge Brain Ops maintenance ledger
-- Stores bounded, queryable findings from scheduled Knowledge maintenance
-- without mixing operational audit state into memory, RAG chunks, or engine homes.

CREATE TABLE IF NOT EXISTS knowledge_maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  page_id UUID REFERENCES knowledge_pages(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES knowledge_entities(id) ON DELETE SET NULL,
  relationship_id UUID REFERENCES knowledge_relationships(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'consolidation_due',
    'compiled_truth_refreshed',
    'citation_audit',
    'stale_source',
    'stale_page',
    'contradiction_candidate',
    'orphan_entity',
    'orphan_relationship',
    'weekly_project_briefing',
    'approval_required'
  )),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_maintenance_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_maintenance_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_maintenance_idempotency
  ON knowledge_maintenance_events(org_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_org_open
  ON knowledge_maintenance_events(org_id, severity, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_project
  ON knowledge_maintenance_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_knowledge_maintenance_updated_at ON knowledge_maintenance_events;
CREATE TRIGGER trg_knowledge_maintenance_updated_at
  BEFORE UPDATE ON knowledge_maintenance_events
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_maintenance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_maintenance_org_select ON knowledge_maintenance_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_maintenance_service_all ON knowledge_maintenance_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
