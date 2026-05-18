-- Phase 5C: Portfolio-Level Automation
-- Adds portfolio scope rules, trigger batch semantics, nullable position fields.

-- 1. Make position fields nullable for portfolio rules
ALTER TABLE polymarket_automation_rules
  ALTER COLUMN condition_id DROP NOT NULL,
  ALTER COLUMN token_id DROP NOT NULL;

ALTER TABLE polymarket_automation_rules
  DROP CONSTRAINT IF EXISTS polymarket_automation_rules_outcome_check;
ALTER TABLE polymarket_automation_rules
  ALTER COLUMN outcome DROP NOT NULL;
ALTER TABLE polymarket_automation_rules
  ADD CONSTRAINT polymarket_automation_rules_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('Yes', 'No'));

ALTER TABLE polymarket_automation_rules
  DROP CONSTRAINT IF EXISTS polymarket_automation_rules_exit_action_check;
ALTER TABLE polymarket_automation_rules
  ALTER COLUMN exit_action DROP NOT NULL;
ALTER TABLE polymarket_automation_rules
  ADD CONSTRAINT polymarket_automation_rules_exit_action_check
    CHECK (exit_action IS NULL OR exit_action IN ('sell_yes', 'sell_no'));

-- 2. Expand rule_type
ALTER TABLE polymarket_automation_rules
  DROP CONSTRAINT IF EXISTS polymarket_automation_rules_rule_type_check;
ALTER TABLE polymarket_automation_rules
  ADD CONSTRAINT polymarket_automation_rules_rule_type_check
    CHECK (rule_type IN (
      'stop_loss', 'take_profit', 'trailing_stop', 'time_exit',
      'portfolio_stop_loss', 'portfolio_take_profit', 'concentration_guard', 'exposure_cap'
    ));

-- 3. Scope column (position vs portfolio)
ALTER TABLE polymarket_automation_rules
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'position'
    CHECK (scope IN ('position', 'portfolio'));

-- 4. Consistency: position rules MUST have position fields, portfolio rules MUST NOT
ALTER TABLE polymarket_automation_rules
  ADD CONSTRAINT position_fields_consistency CHECK (
    (scope = 'position' AND condition_id IS NOT NULL AND token_id IS NOT NULL
     AND outcome IS NOT NULL AND exit_action IS NOT NULL)
    OR
    (scope = 'portfolio' AND condition_id IS NULL AND token_id IS NULL
     AND outcome IS NULL AND exit_action IS NULL)
  );

-- 5. At most one enabled portfolio rule per type per agent
CREATE UNIQUE INDEX idx_par_portfolio_type_dedup
  ON polymarket_automation_rules (agent_id, rule_type)
  WHERE scope = 'portfolio' AND enabled = true;

-- 6. Trigger batch semantics on executions
ALTER TABLE polymarket_automation_executions
  ADD COLUMN trigger_batch_id UUID,
  ADD COLUMN trigger_snapshot JSONB;

-- 7. Replace processing dedup: (rule_id) → (rule_id, condition_id)
DROP INDEX IF EXISTS idx_pae_processing_dedup;
CREATE UNIQUE INDEX idx_pae_processing_dedup_v2
  ON polymarket_automation_executions (rule_id, condition_id)
  WHERE status = 'processing';

-- 8. Replace pending dedup: (rule_id) → (rule_id, condition_id)
DROP INDEX IF EXISTS idx_pae_pending_dedup;
CREATE UNIQUE INDEX idx_pae_pending_dedup_v2
  ON polymarket_automation_executions (rule_id, condition_id)
  WHERE status = 'pending_approval';

-- 9. Index for batch lookups
CREATE INDEX idx_pae_batch ON polymarket_automation_executions (trigger_batch_id)
  WHERE trigger_batch_id IS NOT NULL;

-- 10. Index for approval resolution (fetch all executions in a batch)
CREATE INDEX idx_pae_approval_batch ON polymarket_automation_executions (approval_id)
  WHERE approval_id IS NOT NULL;
