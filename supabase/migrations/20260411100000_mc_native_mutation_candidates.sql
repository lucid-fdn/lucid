-- ============================================================================
-- mc_native_mutation_candidates: staged native mutation proposals
-- ============================================================================
-- Stores Hermes/OpenClaw/etc native durable mutation proposals separately from
-- generic runtime_events so later review/promotion flows can query them
-- directly without scraping feed payloads.

CREATE TABLE IF NOT EXISTS mc_native_mutation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('shared', 'relay', 'native')),
  engine TEXT NOT NULL,
  runtime_flavor TEXT NOT NULL CHECK (runtime_flavor IN ('shared', 'c1_managed', 'c2a_autonomous')),
  mutation_kind TEXT NOT NULL CHECK (mutation_kind IN ('memory_write', 'skill_create', 'skill_update', 'skill_delete')),
  tool_name TEXT NOT NULL,
  tool_args JSONB NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mc_native_mutation_candidates IS 'Engine-native durable mutation proposals captured for later review/promotion. 90-day retention (application-level cleanup).';

CREATE INDEX IF NOT EXISTS idx_mc_native_mutation_candidates_agent_created
  ON mc_native_mutation_candidates(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_native_mutation_candidates_org_created
  ON mc_native_mutation_candidates(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_native_mutation_candidates_runtime_created
  ON mc_native_mutation_candidates(runtime_id, created_at DESC);

ALTER TABLE mc_native_mutation_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their org native mutation candidates"
    ON mc_native_mutation_candidates FOR SELECT
    USING (
      org_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Workers can insert native mutation candidates"
    ON mc_native_mutation_candidates FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_native_mutation_candidates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_native_mutation_candidates;
  END IF;
END $$;
