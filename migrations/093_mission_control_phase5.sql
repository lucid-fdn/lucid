-- Mission Control Phase 5: Intelligence + Cost Optimizer + Auto-Remediation

-- ─── Conversation Scores ───
CREATE TABLE IF NOT EXISTS mc_conversation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  conversation_id TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id),
  sentiment_avg NUMERIC(3,2),        -- -1.0 to 1.0
  satisfaction_score NUMERIC(3,2),   -- 0.0 to 1.0
  turn_count INT DEFAULT 0,
  reask_count INT DEFAULT 0,         -- user repeating same question
  abandonment BOOLEAN DEFAULT FALSE,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_conversation_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_conv_scores_org ON mc_conversation_scores
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_mc_conv_scores_org ON mc_conversation_scores (org_id, computed_at DESC);

-- ─── Topic Clusters ───
CREATE TABLE IF NOT EXISTS mc_topic_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  cluster_label TEXT NOT NULL,
  conversation_count INT DEFAULT 0,
  sample_messages JSONB DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_topic_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_topics_org ON mc_topic_clusters
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── AI Insights ───
CREATE TABLE IF NOT EXISTS mc_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  insight_type TEXT NOT NULL,        -- conversation | cost | health | general
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'info',      -- info | warning | action_required
  agent_id UUID REFERENCES ai_assistants(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_insights_org ON mc_insights
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_mc_insights_org ON mc_insights (org_id, created_at DESC);

-- ─── Cost Recommendations ───
CREATE TABLE IF NOT EXISTS mc_cost_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID REFERENCES ai_assistants(id),
  recommendation_type TEXT NOT NULL, -- model_switch | tool_efficiency | memory_strategy
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_savings_usd NUMERIC(10,2),
  action_config JSONB,               -- machine-readable action to apply
  status TEXT DEFAULT 'pending',      -- pending | applied | dismissed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_cost_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_cost_recs_org ON mc_cost_recommendations
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── Remediation Policies ───
CREATE TABLE IF NOT EXISTS mc_remediation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  trigger_type TEXT NOT NULL,        -- threshold | pattern | schedule
  condition JSONB NOT NULL,          -- { metric: 'error_rate', operator: '>', value: 50 }
  action_type TEXT NOT NULL,         -- pause_agent | notify | switch_model | retry
  action_config JSONB DEFAULT '{}'::jsonb,
  cooldown_seconds INT DEFAULT 300,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_remediation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_remed_policies_org ON mc_remediation_policies
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));

-- ─── Remediation Log ───
CREATE TABLE IF NOT EXISTS mc_remediation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES mc_remediation_policies(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID REFERENCES ai_assistants(id),
  action_taken TEXT NOT NULL,
  outcome TEXT,                      -- success | failed | skipped
  details JSONB DEFAULT '{}'::jsonb,
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mc_remediation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_remed_log_org ON mc_remediation_log
  FOR ALL USING (org_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_mc_remed_log_org ON mc_remediation_log (org_id, triggered_at DESC);

-- ─── RPC: Conversation Intelligence Summary ───
CREATE OR REPLACE FUNCTION mc_conversation_intelligence(p_org_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'avg_sentiment', (
      SELECT COALESCE(AVG(sentiment_avg), 0) FROM mc_conversation_scores
      WHERE org_id = p_org_id AND computed_at > NOW() - INTERVAL '7 days'
    ),
    'avg_satisfaction', (
      SELECT COALESCE(AVG(satisfaction_score), 0) FROM mc_conversation_scores
      WHERE org_id = p_org_id AND computed_at > NOW() - INTERVAL '7 days'
    ),
    'total_conversations_7d', (
      SELECT COUNT(*) FROM mc_conversation_scores
      WHERE org_id = p_org_id AND computed_at > NOW() - INTERVAL '7 days'
    ),
    'abandonment_rate', (
      SELECT COALESCE(
        AVG(CASE WHEN abandonment THEN 1.0 ELSE 0.0 END), 0
      ) FROM mc_conversation_scores
      WHERE org_id = p_org_id AND computed_at > NOW() - INTERVAL '7 days'
    ),
    'topics', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT cluster_label, conversation_count
        FROM mc_topic_clusters
        WHERE org_id = p_org_id
        ORDER BY conversation_count DESC
        LIMIT 10
      ) t
    ),
    'recent_insights', (
      SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json)
      FROM (
        SELECT id, insight_type, title, body, severity, created_at
        FROM mc_insights
        WHERE org_id = p_org_id AND dismissed = FALSE
        ORDER BY created_at DESC
        LIMIT 10
      ) i
    )
  );
$$;
