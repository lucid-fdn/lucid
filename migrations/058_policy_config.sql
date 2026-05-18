-- Migration 058: Policy config column on ai_assistants
-- Phase 1A: Per-assistant policy configuration for run budgets

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS policy_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ai_assistants.policy_config IS
  'Per-assistant policy config (run budgets, tool limits). See docs/OPENCLAW_INTEGRATION_SPEC.md §2.3.
   Default: { "maxLlmCalls": 1, "maxToolCalls": 0, "maxWallTimeMs": 60000, "maxOutputTokens": 4096 }';