-- ============================================================================
-- Lucid-L2 Integration Migration (Clean Slate)
-- ============================================================================
-- REPLACES n8n with Lucid-L2 remote execution
-- Removes old n8n columns, adds Lucid-L2 columns
-- ============================================================================

-- ============================================================================
-- CLEANUP: Remove old n8n columns and tables
-- ============================================================================

-- Drop n8n columns from workflows
ALTER TABLE workflows 
DROP COLUMN IF EXISTS n8n_workflow_id,
DROP COLUMN IF EXISTS n8n_json,
DROP COLUMN IF EXISTS content_hash,
DROP COLUMN IF EXISTS last_synced_at,
DROP COLUMN IF EXISTS n8n_updated_at,
DROP COLUMN IF EXISTS node_type_versions,
DROP COLUMN IF EXISTS auto_heal_drift;

-- Drop n8n columns from workflow_executions
ALTER TABLE workflow_executions
DROP COLUMN IF EXISTS n8n_execution_id,
DROP COLUMN IF EXISTS idempotency_key;

-- Drop n8n-specific tables
DROP TABLE IF EXISTS n8n_credential_aliases CASCADE;
DROP TABLE IF EXISTS system_versions CASCADE;
DROP TABLE IF EXISTS drift_conflicts CASCADE;

-- Drop n8n indexes
DROP INDEX IF EXISTS workflows_n8n_workflow_id_idx;
DROP INDEX IF EXISTS workflow_executions_n8n_idx;
DROP INDEX IF EXISTS workflow_executions_idem_idx;
DROP INDEX IF EXISTS n8n_credential_aliases_tenant_idx;
DROP INDEX IF EXISTS n8n_cred_aliases_lookup;
DROP INDEX IF EXISTS system_versions_active_idx;
DROP INDEX IF EXISTS drift_conflicts_workflow_idx;

-- Drop n8n constraint
ALTER TABLE workflow_executions 
DROP CONSTRAINT IF EXISTS uniq_workflow_idempotency;

-- ============================================================================
-- ADD: Lucid-L2 columns
-- ============================================================================

-- Add Lucid-L2 tracking columns to workflows table
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS lucid_l2_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS lucid_l2_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lucid_l2_last_error TEXT;

-- Index for Lucid-L2 workflow lookups (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_workflows_lucid_l2_id 
ON workflows(lucid_l2_workflow_id) 
WHERE lucid_l2_workflow_id IS NOT NULL;

-- Add Lucid-L2 execution tracking to workflow_executions table
ALTER TABLE workflow_executions
ADD COLUMN IF NOT EXISTS lucid_l2_execution_id TEXT;

-- Index for Lucid-L2 execution lookups
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lucid_l2 
ON workflow_executions(lucid_l2_execution_id) 
WHERE lucid_l2_execution_id IS NOT NULL;

-- RLS Policies for workflow_executions
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Users can view their workflow executions
CREATE POLICY "Users can view their workflow executions"
  ON workflow_executions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Users can insert their workflow executions
CREATE POLICY "Users can insert their workflow executions"
  ON workflow_executions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Users can update their workflow executions
CREATE POLICY "Users can update their workflow executions"
  ON workflow_executions FOR UPDATE
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Comment on table
COMMENT ON TABLE workflow_executions IS 'Tracks workflow execution history and status from Lucid-L2';
COMMENT ON COLUMN workflows.lucid_l2_workflow_id IS 'ID of workflow in Lucid-L2 n8n instance';
COMMENT ON COLUMN workflows.lucid_l2_synced_at IS 'Last successful sync time with Lucid-L2';
COMMENT ON COLUMN workflows.lucid_l2_last_error IS 'Last error message from Lucid-L2 sync';
