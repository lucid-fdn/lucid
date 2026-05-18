-- Mission Control Phase 6: Public Status Pages

-- ─── Status Pages ───
CREATE TABLE IF NOT EXISTS mc_status_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) UNIQUE,
  enabled BOOLEAN DEFAULT FALSE,
  public_slug TEXT UNIQUE,           -- e.g. 'my-org/my-agent'
  custom_title TEXT,
  custom_description TEXT,
  show_response_time BOOLEAN DEFAULT TRUE,
  show_uptime BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_status_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_status_pages_org ON mc_status_pages
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── Incidents ───
CREATE TABLE IF NOT EXISTS mc_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  status_page_id UUID REFERENCES mc_status_pages(id),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'minor',     -- minor | major | critical
  status TEXT DEFAULT 'investigating', -- investigating | identified | monitoring | resolved
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  auto_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_incidents_org ON mc_incidents
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_mc_incidents_agent ON mc_incidents (agent_id, created_at DESC);

-- ─── RPC: Public status data (no auth required, filtered by enabled pages) ───
CREATE OR REPLACE FUNCTION mc_public_status(p_public_slug TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'agent_name', aa.name,
    'title', COALESCE(sp.custom_title, aa.name),
    'description', sp.custom_description,
    'current_status', CASE
      WHEN EXISTS (
        SELECT 1 FROM mc_incidents i
        WHERE i.agent_id = sp.agent_id AND i.status != 'resolved'
      ) THEN 'degraded'
      ELSE 'operational'
    END,
    'uptime_90d', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 100.0
        ELSE ROUND(
          (1.0 - COUNT(*) FILTER (WHERE aoe.status = 'failed')::numeric / GREATEST(COUNT(*), 1)) * 100,
          2
        )
      END
      FROM assistant_outbound_events aoe
      JOIN assistant_channels ac ON ac.id = aoe.channel_id
      WHERE ac.assistant_id = sp.agent_id
        AND aoe.created_at > NOW() - INTERVAL '90 days'
    ),
    'recent_incidents', (
      SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json)
      FROM (
        SELECT id, title, description, severity, status, started_at, resolved_at
        FROM mc_incidents
        WHERE agent_id = sp.agent_id
        ORDER BY created_at DESC
        LIMIT 10
      ) i
    )
  )
  FROM mc_status_pages sp
  JOIN ai_assistants aa ON aa.id = sp.agent_id
  WHERE sp.public_slug = p_public_slug
    AND sp.enabled = TRUE;
$$;
