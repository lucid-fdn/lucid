-- ============================================================================
-- COMPLETE LUCID-L2 MIGRATION
-- ============================================================================
-- This migration completely replaces n8n with Lucid-L2
-- Run this with: supabase db push
-- Or execute directly in Supabase SQL Editor
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: DROP OLD N8N INFRASTRUCTURE
-- ============================================================================

-- Drop RLS policies that might reference n8n tables
DROP POLICY IF EXISTS n8n_credential_aliases_tenant_isolation ON n8n_credential_aliases;

-- Drop n8n-specific tables (CASCADE removes dependencies)
DROP TABLE IF EXISTS drift_conflicts CASCADE;
DROP TABLE IF EXISTS system_versions CASCADE;
DROP TABLE IF EXISTS n8n_credential_aliases CASCADE;

-- Drop n8n indexes from workflows
DROP INDEX IF EXISTS workflows_n8n_workflow_id_idx;

-- Drop n8n indexes from workflow_executions
DROP INDEX IF EXISTS workflow_executions_n8n_idx;
DROP INDEX IF EXISTS workflow_executions_idem_idx;

-- Drop n8n constraint from workflow_executions
ALTER TABLE workflow_executions 
DROP CONSTRAINT IF EXISTS uniq_workflow_idempotency;

-- Drop n8n columns from workflows table
ALTER TABLE workflows 
DROP COLUMN IF EXISTS n8n_workflow_id CASCADE,
DROP COLUMN IF EXISTS n8n_json CASCADE,
DROP COLUMN IF EXISTS content_hash CASCADE,
DROP COLUMN IF EXISTS last_synced_at CASCADE,
DROP COLUMN IF EXISTS n8n_updated_at CASCADE,
DROP COLUMN IF EXISTS node_type_versions CASCADE,
DROP COLUMN IF EXISTS auto_heal_drift CASCADE;

-- Drop n8n columns from workflow_executions table
ALTER TABLE workflow_executions
DROP COLUMN IF EXISTS n8n_execution_id CASCADE,
DROP COLUMN IF EXISTS idempotency_key CASCADE;

-- ============================================================================
-- STEP 2: ADD LUCID-L2 INFRASTRUCTURE
-- ============================================================================

-- Add Lucid-L2 tracking columns to workflows table
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS lucid_l2_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS lucid_l2_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lucid_l2_last_error TEXT;

-- Add Lucid-L2 execution tracking to workflow_executions table
ALTER TABLE workflow_executions
ADD COLUMN IF NOT EXISTS lucid_l2_execution_id TEXT;

-- ============================================================================
-- STEP 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for Lucid-L2 workflow lookups (partial index - only non-null values)
CREATE INDEX IF NOT EXISTS idx_workflows_lucid_l2_id 
ON workflows(lucid_l2_workflow_id) 
WHERE lucid_l2_workflow_id IS NOT NULL;

-- Index for Lucid-L2 execution lookups (partial index - only non-null values)
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lucid_l2 
ON workflow_executions(lucid_l2_execution_id) 
WHERE lucid_l2_execution_id IS NOT NULL;

-- ============================================================================
-- STEP 4: ENSURE RLS POLICIES ARE IN PLACE
-- ============================================================================

-- Enable RLS on workflow_executions (if not already enabled)
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their workflow executions" ON workflow_executions;
DROP POLICY IF EXISTS "Users can insert their workflow executions" ON workflow_executions;
DROP POLICY IF EXISTS "Users can update their workflow executions" ON workflow_executions;

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

-- ============================================================================
-- STEP 5: ADD DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON COLUMN workflows.lucid_l2_workflow_id IS 'ID of workflow in Lucid-L2 remote n8n instance';
COMMENT ON COLUMN workflows.lucid_l2_synced_at IS 'Last successful sync timestamp with Lucid-L2';
COMMENT ON COLUMN workflows.lucid_l2_last_error IS 'Last error message from Lucid-L2 sync attempt';
COMMENT ON COLUMN workflow_executions.lucid_l2_execution_id IS 'Lucid-L2 execution ID for status tracking';
COMMENT ON TABLE workflow_executions IS 'Tracks workflow execution history and status from Lucid-L2';

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Optional - Run these after migration)
-- ============================================================================

-- Check workflows table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'workflows'
-- AND column_name LIKE '%lucid%'
-- ORDER BY ordinal_position;

-- Check workflow_executions table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'workflow_executions'
-- AND column_name LIKE '%lucid%'
-- ORDER BY ordinal_position;

-- Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('workflows', 'workflow_executions')
-- AND indexname LIKE '%lucid%';

-- Check RLS policies
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'workflow_executions';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Removed all n8n columns from workflows
-- ✅ Removed all n8n columns from workflow_executions
-- ✅ Dropped n8n-specific tables (n8n_credential_aliases, system_versions, drift_conflicts)
-- ✅ Dropped all n8n indexes and constraints
-- ✅ Added lucid_l2_workflow_id, lucid_l2_synced_at, lucid_l2_last_error to workflows
-- ✅ Added lucid_l2_execution_id to workflow_executions
-- ✅ Created optimized indexes for Lucid-L2 columns
-- ✅ Ensured RLS policies are in place
-- ✅ Added documentation comments
-- ============================================================================
