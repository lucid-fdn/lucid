-- Migration: Dedicated Runtimes — Multi-Runtime Fleet Management
-- Tables: dedicated_runtimes, runtime_events
-- Columns: ai_assistants.runtime_id, vps_health_snapshots.runtime_id
-- RPCs: mc_runtimes, mc_agent_fleet (extended with runtime join)
-- View: mc_feed_events_v (extended with runtime_events UNION)

-- ─── dedicated_runtimes ───

CREATE TABLE IF NOT EXISTS dedicated_runtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT,
  l2_deployment_id TEXT,
  l2_passport_id TEXT,
  provider TEXT NOT NULL
    CHECK (provider IN ('railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual')),
  api_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'deploying', 'connected', 'stale', 'offline', 'failed', 'revoked')),
  last_seen_at TIMESTAMPTZ,
  openclaw_version TEXT,
  cpu_percent NUMERIC(5,2),
  ram_percent NUMERIC(5,2),
  disk_percent NUMERIC(5,2),
  gpu_percent NUMERIC(5,2),
  worker_pending_events INT NOT NULL DEFAULT 0,
  worker_dead_letters INT NOT NULL DEFAULT 0,
  agent_count INT NOT NULL DEFAULT 0,
  uptime_seconds BIGINT NOT NULL DEFAULT 0,
  generation INT NOT NULL DEFAULT 1,
  heartbeat_counter INT NOT NULL DEFAULT 0,
  deployment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

COMMENT ON COLUMN dedicated_runtimes.generation IS 'Lifecycle counter — increments on re-provision. Stale heartbeats with old generation rejected.';
COMMENT ON COLUMN dedicated_runtimes.heartbeat_counter IS 'Tracks beats since last history write. History snapshot written every 5th beat (write coalescing).';
COMMENT ON COLUMN dedicated_runtimes.api_key_hash IS 'bcrypt hash of runtime API key. Key returned once on creation, never stored plaintext.';

ALTER TABLE dedicated_runtimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's runtimes"
  ON dedicated_runtimes FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert runtimes for their org"
  ON dedicated_runtimes FOR INSERT
  WITH CHECK (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org's runtimes"
  ON dedicated_runtimes FOR UPDATE
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their org's runtimes"
  ON dedicated_runtimes FOR DELETE
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_dedicated_runtimes_org
  ON dedicated_runtimes (org_id, status) WHERE status != 'revoked';

-- ─── runtime_events ───

CREATE TABLE IF NOT EXISTS runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_id UUID NOT NULL REFERENCES dedicated_runtimes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('tool_call', 'tool_result', 'error', 'message_received', 'message_sent', 'run_started', 'run_finished')),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE runtime_events IS 'Events reported by dedicated runtimes via REST phone-home. 30-day retention (application-level cleanup).';

ALTER TABLE runtime_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's runtime events"
  ON runtime_events FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert runtime events for their org"
  ON runtime_events FOR INSERT
  WITH CHECK (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_runtime_events_org_time
  ON runtime_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_events_runtime
  ON runtime_events (runtime_id, created_at DESC);

-- ─── Extend ai_assistants with runtime_id ───

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_assistants.runtime_id IS 'NULL = default runtime (Lucid Cloud / This Instance). Non-null = runs on a dedicated runtime.';

CREATE INDEX IF NOT EXISTS idx_ai_assistants_runtime
  ON ai_assistants (runtime_id) WHERE runtime_id IS NOT NULL;

-- ─── Extend vps_health_snapshots with runtime_id ───

ALTER TABLE vps_health_snapshots
  ADD COLUMN IF NOT EXISTS runtime_id UUID REFERENCES dedicated_runtimes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_vps_health_runtime
  ON vps_health_snapshots (runtime_id, reported_at DESC) WHERE runtime_id IS NOT NULL;

-- ─── RPC: mc_runtimes ───

CREATE OR REPLACE FUNCTION mc_runtimes(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  description TEXT,
  provider TEXT,
  status TEXT,
  last_seen_at TIMESTAMPTZ,
  openclaw_version TEXT,
  cpu_percent NUMERIC,
  ram_percent NUMERIC,
  disk_percent NUMERIC,
  gpu_percent NUMERIC,
  worker_pending_events INT,
  worker_dead_letters INT,
  agent_count BIGINT,
  deployment_url TEXT,
  l2_deployment_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id, dr.display_name, dr.description, dr.provider, dr.status,
    dr.last_seen_at, dr.openclaw_version,
    dr.cpu_percent, dr.ram_percent, dr.disk_percent, dr.gpu_percent,
    dr.worker_pending_events, dr.worker_dead_letters,
    (SELECT COUNT(*) FROM ai_assistants WHERE runtime_id = dr.id AND deleted_at IS NULL)::BIGINT AS agent_count,
    dr.deployment_url, dr.l2_deployment_id, dr.created_at
  FROM dedicated_runtimes dr
  WHERE dr.org_id = p_org_id AND dr.status != 'revoked'
  ORDER BY dr.created_at DESC;
$$;

-- ─── Extend mc_agent_fleet with runtime info ───

-- Must drop first because return type is changing (adding runtime columns)
DROP FUNCTION IF EXISTS mc_agent_fleet(UUID);

CREATE OR REPLACE FUNCTION mc_agent_fleet(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  lucid_model TEXT,
  mc_status TEXT,
  memory_enabled BOOLEAN,
  approval_required_tools TEXT[],
  cost_limit_per_run_usd NUMERIC,
  cost_limit_daily_usd NUMERIC,
  cost_limit_monthly_usd NUMERIC,
  last_active_at TIMESTAMPTZ,
  errors_last_hour BIGINT,
  pending_approvals BIGINT,
  health_score NUMERIC,
  cost_today_usd NUMERIC,
  runtime_id UUID,
  runtime_name TEXT,
  runtime_status TEXT,
  runtime_provider TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    aa.id,
    aa.name,
    aa.description,
    aa.lucid_model,
    COALESCE(aa.mc_status, 'active') AS mc_status,
    aa.memory_enabled,
    aa.approval_required_tools,
    aa.cost_limit_per_run_usd,
    aa.cost_limit_daily_usd,
    aa.cost_limit_monthly_usd,
    (SELECT MAX(aie.created_at) FROM assistant_inbound_events aie WHERE aie.assistant_id = aa.id) AS last_active_at,
    (SELECT COUNT(*) FROM assistant_outbound_events aoe
     JOIN assistant_channels ac2 ON ac2.id = aoe.channel_id
     WHERE ac2.assistant_id = aa.id AND aoe.status = 'failed'
       AND aoe.created_at > NOW() - INTERVAL '1 hour') AS errors_last_hour,
    (SELECT COUNT(*) FROM mc_pending_approvals mpa
     WHERE mpa.agent_id = aa.id AND mpa.status = 'pending') AS pending_approvals,
    (SELECT hs.overall_score FROM mc_agent_health_scores hs
     WHERE hs.agent_id = aa.id ORDER BY hs.computed_at DESC LIMIT 1) AS health_score,
    (SELECT COALESCE(ct.estimated_cost_usd, 0) FROM mc_agent_cost_tracking ct
     WHERE ct.agent_id = aa.id AND ct.date = CURRENT_DATE) AS cost_today_usd,
    aa.runtime_id,
    dr.display_name AS runtime_name,
    dr.status AS runtime_status,
    dr.provider AS runtime_provider
  FROM ai_assistants aa
  LEFT JOIN dedicated_runtimes dr ON dr.id = aa.runtime_id
  WHERE aa.org_id = p_org_id
    AND aa.deleted_at IS NULL
  ORDER BY
    CASE WHEN COALESCE(aa.mc_status, 'active') = 'paused' THEN 1 ELSE 0 END,
    aa.name;
$$;

-- ─── Extend mc_feed_events_v with runtime_events UNION ───

CREATE OR REPLACE VIEW mc_feed_events_v AS
-- Inbound messages (message_received)
SELECT
  ie.id,
  'message_received'::TEXT AS event_type,
  'info'::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    'message_text', LEFT(ie.message_text, 200),
    'channel_type', ac.channel_type,
    'external_user_id', ie.external_user_id,
    'status', ie.status
  ) AS payload,
  ie.created_at
FROM assistant_inbound_events ie
JOIN assistant_channels ac ON ac.id = ie.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL

UNION ALL

-- Outbound messages (message_sent)
SELECT
  oe.id,
  CASE
    WHEN oe.status = 'failed' THEN 'error'
    ELSE 'message_sent'
  END::TEXT AS event_type,
  CASE
    WHEN oe.status = 'failed' THEN 'error'
    ELSE 'info'
  END::TEXT AS severity,
  aa.id AS agent_id,
  aa.name AS agent_name,
  aa.org_id,
  NULL::TEXT AS run_id,
  jsonb_build_object(
    'message_text', LEFT(oe.message_text, 200),
    'channel_type', ac.channel_type,
    'status', oe.status,
    'last_error', oe.last_error
  ) AS payload,
  oe.created_at
FROM assistant_outbound_events oe
JOIN assistant_channels ac ON ac.id = oe.channel_id
JOIN ai_assistants aa ON aa.id = ac.assistant_id
WHERE aa.deleted_at IS NULL

UNION ALL

-- Runtime events (from dedicated runtimes)
SELECT
  re.id,
  re.event_type,
  CASE
    WHEN re.severity = 'warning' THEN 'warn'
    ELSE re.severity
  END::TEXT AS severity,
  re.agent_id,
  COALESCE(aa.name, 'Unknown Agent') AS agent_name,
  re.org_id,
  NULL::TEXT AS run_id,
  re.payload,
  re.created_at
FROM runtime_events re
LEFT JOIN ai_assistants aa ON aa.id = re.agent_id
WHERE (aa.deleted_at IS NULL OR re.agent_id IS NULL);

-- ─── Enable Realtime on new tables ───

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dedicated_runtimes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dedicated_runtimes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'runtime_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE runtime_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vps_health_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vps_health_snapshots;
  END IF;
END $$;
