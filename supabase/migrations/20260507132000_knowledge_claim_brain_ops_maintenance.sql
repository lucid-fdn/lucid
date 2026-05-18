-- Knowledge claim Brain Ops maintenance
-- Extends the existing Knowledge maintenance ledger so claim drift findings
-- are first-class, queryable, and idempotent.

ALTER TABLE knowledge_maintenance_events
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES knowledge_claims(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_knowledge_maintenance_claim;
CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_claim
  ON knowledge_maintenance_events(claim_id, created_at DESC)
  WHERE claim_id IS NOT NULL;

ALTER TABLE knowledge_maintenance_events
  DROP CONSTRAINT IF EXISTS knowledge_maintenance_events_event_type_check;

ALTER TABLE knowledge_maintenance_events
  ADD CONSTRAINT knowledge_maintenance_events_event_type_check
  CHECK (event_type IN (
    'consolidation_due',
    'compiled_truth_refreshed',
    'citation_audit',
    'stale_source',
    'stale_page',
    'contradiction_candidate',
    'orphan_entity',
    'orphan_relationship',
    'weekly_project_briefing',
    'approval_required',
    'claim_stale',
    'claim_no_evidence',
    'claim_expired',
    'claim_conflict',
    'source_sync_failed',
    'source_stale',
    'embedding_provider_mismatch',
    'embedding_dimension_mismatch',
    'vector_index_degraded',
    'l2_projection_lagging',
    'channel_gap_detected'
  ));
