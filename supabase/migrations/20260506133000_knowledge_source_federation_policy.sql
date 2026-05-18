-- Knowledge source/federation policy
-- Adds operational state around source trust, freshness, retrieval inclusion,
-- and refresh scheduling without creating a parallel memory/vector system.

ALTER TABLE knowledge_sources
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'stale', 'errored', 'archived')),
  ADD COLUMN IF NOT EXISTS include_in_retrieval BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS refresh_policy TEXT NOT NULL DEFAULT 'manual'
    CHECK (refresh_policy IN ('manual', 'on_change', 'scheduled')),
  ADD COLUMN IF NOT EXISTS refresh_interval_seconds INTEGER
    CHECK (refresh_interval_seconds IS NULL OR refresh_interval_seconds >= 300),
  ADD COLUMN IF NOT EXISTS refresh_status TEXT NOT NULL DEFAULT 'never'
    CHECK (refresh_status IN ('never', 'pending', 'ok', 'failed')),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_error TEXT,
  ADD COLUMN IF NOT EXISTS connector_key TEXT,
  ADD COLUMN IF NOT EXISTS external_etag TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_org_status
  ON knowledge_sources(org_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_due_refresh
  ON knowledge_sources(next_refresh_at ASC)
  WHERE status = 'active'
    AND include_in_retrieval = true
    AND refresh_policy = 'scheduled'
    AND next_refresh_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_connector
  ON knowledge_sources(org_id, connector_key, source_ref)
  WHERE connector_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_stale
  ON knowledge_sources(org_id, stale_after ASC)
  WHERE status = 'active'
    AND stale_after IS NOT NULL;
