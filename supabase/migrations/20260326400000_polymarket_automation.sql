-- PolyClaw Phase 5A: Protective Alerts + Approval-Based Exits
-- Rule-based monitoring with approval-gated exits.

CREATE TABLE IF NOT EXISTS polymarket_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('Yes', 'No')),

  -- Rule definition (static, user-configured)
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'stop_loss', 'take_profit', 'trailing_stop', 'time_exit'
  )),
  rule_config JSONB NOT NULL DEFAULT '{}',
  -- stop_loss:      { "threshold_price": 0.30 }
  -- take_profit:    { "threshold_price": 0.85 }
  -- trailing_stop:  { "trail_percent": 10 }
  -- time_exit:      { "exit_hours_before_close": 24 }

  -- Mutable runtime state (system-maintained, never user-edited)
  rule_state JSONB NOT NULL DEFAULT '{}',
  -- trailing_stop:  { "high_water_mark": 0.75 }

  -- Exit parameters
  exit_action TEXT NOT NULL CHECK (exit_action IN ('sell_yes', 'sell_no')),
  exit_amount_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00,

  -- Safety
  enabled BOOLEAN NOT NULL DEFAULT true,
  disabled_reason TEXT,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  max_triggers INTEGER,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_par_agent_enabled ON polymarket_automation_rules (agent_id)
  WHERE enabled = true;
ALTER TABLE polymarket_automation_rules ENABLE ROW LEVEL SECURITY;

-- SELECT only — writes are service-role-only (worker + tool handler)
CREATE POLICY "org_members_select_rules" ON polymarket_automation_rules
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS polymarket_automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES polymarket_automation_rules(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  org_id UUID NOT NULL,
  condition_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,

  trigger_price NUMERIC(10,6),
  threshold_value NUMERIC(10,6),
  position_size TEXT,

  status TEXT NOT NULL CHECK (status IN (
    'pending_approval', 'approved', 'denied', 'expired',
    'executed', 'failed', 'below_minimum'
  )),
  trade_result JSONB,
  approval_id UUID,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pae_rule ON polymarket_automation_executions (rule_id, created_at DESC);
-- Dedup: at most one pending approval per rule at a time
CREATE UNIQUE INDEX idx_pae_pending_dedup ON polymarket_automation_executions (rule_id)
  WHERE status = 'pending_approval';
ALTER TABLE polymarket_automation_executions ENABLE ROW LEVEL SECURITY;

-- SELECT only — writes are service-role-only
CREATE POLICY "org_members_select_executions" ON polymarket_automation_executions
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
