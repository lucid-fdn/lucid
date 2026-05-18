-- Mission Control Phase 4: Health Scores + VPS Support

-- ─── Agent Health Scores ───
CREATE TABLE IF NOT EXISTS mc_agent_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  overall_score NUMERIC(5,2) NOT NULL,
  dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { latency: 85, error_rate: 92, memory_health: 70, tool_reliability: 88, user_satisfaction: 75, cost_efficiency: 90 }
  fleet_percentile NUMERIC(5,2),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_agent_health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY mc_health_scores_org_access ON mc_agent_health_scores
  FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_mc_health_scores_agent
  ON mc_agent_health_scores (agent_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_health_scores_org
  ON mc_agent_health_scores (org_id, computed_at DESC);

-- ─── VPS Health Snapshots ───
CREATE TABLE IF NOT EXISTS vps_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  instance_id TEXT NOT NULL,
  cpu_percent NUMERIC(5,2),
  ram_percent NUMERIC(5,2),
  disk_percent NUMERIC(5,2),
  worker_pending_events INT DEFAULT 0,
  worker_dead_letters INT DEFAULT 0,
  openclaw_version TEXT,
  last_sync_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vps_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY vps_health_org_access ON vps_health_snapshots
  FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_vps_health_org
  ON vps_health_snapshots (org_id, reported_at DESC);

-- Retention: keep 7 days (application-level cleanup)

-- ─── RPC: Overview KPIs ───
CREATE OR REPLACE FUNCTION mc_overview_kpis(p_org_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_agents', (
      SELECT COUNT(*) FROM ai_assistants
      WHERE org_id = p_org_id AND deleted_at IS NULL
    ),
    'active_agents', (
      SELECT COUNT(*) FROM ai_assistants
      WHERE org_id = p_org_id AND deleted_at IS NULL
        AND COALESCE(mc_status, 'active') = 'active'
    ),
    'paused_agents', (
      SELECT COUNT(*) FROM ai_assistants
      WHERE org_id = p_org_id AND deleted_at IS NULL
        AND mc_status = 'paused'
    ),
    'pending_approvals', (
      SELECT COUNT(*) FROM mc_pending_approvals
      WHERE org_id = p_org_id AND status = 'pending'
    ),
    'errors_24h', (
      SELECT COUNT(*) FROM assistant_outbound_events aoe
      JOIN assistant_channels ac ON ac.id = aoe.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id
        AND aoe.status = 'failed'
        AND aoe.created_at > NOW() - INTERVAL '24 hours'
    ),
    'total_runs_24h', (
      SELECT COUNT(*) FROM assistant_inbound_events aie
      JOIN assistant_channels ac ON ac.id = aie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id
        AND aie.created_at > NOW() - INTERVAL '24 hours'
    ),
    'cost_today_usd', (
      SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM mc_agent_cost_tracking
      WHERE org_id = p_org_id AND date = CURRENT_DATE
    )
  )
  -- Org membership enforced by caller
$$;

-- ─── RPC: Agent Fleet (extended with health score) ───
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
  cost_today_usd NUMERIC
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
     WHERE ct.agent_id = aa.id AND ct.date = CURRENT_DATE) AS cost_today_usd
  FROM ai_assistants aa
  WHERE aa.org_id = p_org_id
    AND aa.deleted_at IS NULL
  ORDER BY
    CASE WHEN COALESCE(aa.mc_status, 'active') = 'paused' THEN 1 ELSE 0 END,
    aa.name;
$$;

-- ─── RPC: System Health ───
CREATE OR REPLACE FUNCTION mc_system_health(p_org_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pending_events', (
      SELECT COUNT(*) FROM assistant_inbound_events aie
      JOIN assistant_channels ac ON ac.id = aie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id AND aie.status = 'pending'
    ),
    'dead_letters', (
      SELECT COUNT(*) FROM assistant_inbound_events aie
      JOIN assistant_channels ac ON ac.id = aie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id AND aie.status = 'dead_lettered'
    ),
    'oldest_pending_age_seconds', (
      SELECT EXTRACT(EPOCH FROM (NOW() - MIN(aie.created_at)))
      FROM assistant_inbound_events aie
      JOIN assistant_channels ac ON ac.id = aie.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id AND aie.status = 'pending'
    ),
    'errors_last_hour', (
      SELECT COUNT(*) FROM assistant_outbound_events aoe
      JOIN assistant_channels ac ON ac.id = aoe.channel_id
      JOIN ai_assistants aa ON aa.id = ac.assistant_id
      WHERE aa.org_id = p_org_id AND aoe.status = 'failed'
        AND aoe.created_at > NOW() - INTERVAL '1 hour'
    ),
    'recent_errors', (
      SELECT COALESCE(json_agg(row_to_json(e)), '[]'::json)
      FROM (
        SELECT aoe.id, ac.assistant_id, aa.name AS agent_name,
               aoe.last_error, aoe.created_at
        FROM assistant_outbound_events aoe
        JOIN assistant_channels ac ON ac.id = aoe.channel_id
        JOIN ai_assistants aa ON aa.id = ac.assistant_id
        WHERE aa.org_id = p_org_id AND aoe.status = 'failed'
        ORDER BY aoe.created_at DESC
        LIMIT 20
      ) e
    )
  );
$$;
