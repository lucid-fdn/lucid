-- Fix remaining FK references to ai_assistants that were missing ON DELETE CASCADE.
-- These block hard-deleting an assistant when child rows exist.

-- ─── dedicated_runtimes.created_assistant_id ───
-- SET NULL is correct here: revoking the runtime is handled by prepareAssistantDeletion(),
-- but if the intent row still references the deleted assistant, we just null it out.
ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_created_assistant_id_fkey,
  ADD CONSTRAINT dedicated_runtimes_created_assistant_id_fkey
    FOREIGN KEY (created_assistant_id) REFERENCES ai_assistants(id) ON DELETE SET NULL;

-- ─── mc_agent_cost_tracking ───
ALTER TABLE mc_agent_cost_tracking
  DROP CONSTRAINT IF EXISTS mc_agent_cost_tracking_agent_id_fkey,
  ADD CONSTRAINT mc_agent_cost_tracking_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;

-- ─── mc_remediation_policies (nullable agent_id — may not exist on all deploys) ───
DO $$ BEGIN
  ALTER TABLE mc_remediation_policies
    DROP CONSTRAINT IF EXISTS mc_remediation_policies_agent_id_fkey;
  ALTER TABLE mc_remediation_policies
    ADD CONSTRAINT mc_remediation_policies_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES ai_assistants(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
          WHEN undefined_column THEN NULL;
END $$;
