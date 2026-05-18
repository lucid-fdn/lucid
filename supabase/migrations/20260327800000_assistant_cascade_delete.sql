-- Migration: Add ON DELETE CASCADE to ai_assistants FK references + grandchild FKs
-- Previously these defaulted to RESTRICT, blocking hard deletes.
-- All child data is operational/analytics — meaningless without the parent agent.
--
-- Also fixes grandchild cascade chain blockers:
--   ai_assistants → launched_agents → agent_usage_ledger (was RESTRICT)
--   ai_assistants → mc_status_pages → mc_incidents.status_page_id (was RESTRICT)
--   ai_assistants → mc_experiments → mc_experiment_assignments (was RESTRICT)
--   ai_assistants → mc_turn_snapshots → mc_whatif_results (was RESTRICT)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Grandchild FKs (must be fixed BEFORE parent FKs to avoid order issues)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── agent_usage_ledger → launched_agents ───
ALTER TABLE agent_usage_ledger
  DROP CONSTRAINT IF EXISTS agent_usage_ledger_launched_agent_id_fkey,
  ADD CONSTRAINT agent_usage_ledger_launched_agent_id_fkey
    FOREIGN KEY (launched_agent_id) REFERENCES launched_agents(id) ON DELETE CASCADE;

-- ─── mc_incidents.status_page_id → mc_status_pages ───
ALTER TABLE mc_incidents
  DROP CONSTRAINT IF EXISTS mc_incidents_status_page_id_fkey,
  ADD CONSTRAINT mc_incidents_status_page_id_fkey
    FOREIGN KEY (status_page_id) REFERENCES mc_status_pages(id) ON DELETE CASCADE;

-- ─── mc_experiment_assignments → mc_experiments ───
ALTER TABLE mc_experiment_assignments
  DROP CONSTRAINT IF EXISTS mc_experiment_assignments_experiment_id_fkey,
  ADD CONSTRAINT mc_experiment_assignments_experiment_id_fkey
    FOREIGN KEY (experiment_id) REFERENCES mc_experiments(id) ON DELETE CASCADE;

-- ─── mc_whatif_results → mc_turn_snapshots ───
ALTER TABLE mc_whatif_results
  DROP CONSTRAINT IF EXISTS mc_whatif_results_snapshot_id_fkey,
  ADD CONSTRAINT mc_whatif_results_snapshot_id_fkey
    FOREIGN KEY (snapshot_id) REFERENCES mc_turn_snapshots(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Direct ai_assistants child FKs
-- ═══════════════════════════════════════════════════════════════════════

-- ─── launched_agents ───
ALTER TABLE launched_agents
  DROP CONSTRAINT IF EXISTS launched_agents_assistant_id_fkey,
  ADD CONSTRAINT launched_agents_assistant_id_fkey
    FOREIGN KEY (assistant_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_proof_anchors ───
ALTER TABLE mc_proof_anchors
  DROP CONSTRAINT IF EXISTS mc_proof_anchors_agent_id_fkey,
  ADD CONSTRAINT mc_proof_anchors_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_agent_health_scores ───
ALTER TABLE mc_agent_health_scores
  DROP CONSTRAINT IF EXISTS mc_agent_health_scores_agent_id_fkey,
  ADD CONSTRAINT mc_agent_health_scores_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_conversation_scores ───
ALTER TABLE mc_conversation_scores
  DROP CONSTRAINT IF EXISTS mc_conversation_scores_agent_id_fkey,
  ADD CONSTRAINT mc_conversation_scores_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_insights (nullable agent_id) ───
ALTER TABLE mc_insights
  DROP CONSTRAINT IF EXISTS mc_insights_agent_id_fkey,
  ADD CONSTRAINT mc_insights_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_cost_recommendations (nullable agent_id) ───
ALTER TABLE mc_cost_recommendations
  DROP CONSTRAINT IF EXISTS mc_cost_recommendations_agent_id_fkey,
  ADD CONSTRAINT mc_cost_recommendations_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_remediation_log (nullable agent_id) ───
ALTER TABLE mc_remediation_log
  DROP CONSTRAINT IF EXISTS mc_remediation_log_agent_id_fkey,
  ADD CONSTRAINT mc_remediation_log_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_status_pages ───
ALTER TABLE mc_status_pages
  DROP CONSTRAINT IF EXISTS mc_status_pages_agent_id_fkey,
  ADD CONSTRAINT mc_status_pages_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_incidents ───
ALTER TABLE mc_incidents
  DROP CONSTRAINT IF EXISTS mc_incidents_agent_id_fkey,
  ADD CONSTRAINT mc_incidents_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_turn_snapshots ───
ALTER TABLE mc_turn_snapshots
  DROP CONSTRAINT IF EXISTS mc_turn_snapshots_agent_id_fkey,
  ADD CONSTRAINT mc_turn_snapshots_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_experiments (two FK columns) ───
ALTER TABLE mc_experiments
  DROP CONSTRAINT IF EXISTS mc_experiments_base_agent_id_fkey,
  ADD CONSTRAINT mc_experiments_base_agent_id_fkey
    FOREIGN KEY (base_agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

ALTER TABLE mc_experiments
  DROP CONSTRAINT IF EXISTS mc_experiments_variant_agent_id_fkey,
  ADD CONSTRAINT mc_experiments_variant_agent_id_fkey
    FOREIGN KEY (variant_agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;
