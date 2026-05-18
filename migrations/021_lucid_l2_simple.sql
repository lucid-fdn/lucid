-- ============================================================================
-- SIMPLE LUCID-L2 MIGRATION (No n8n cleanup needed)
-- ============================================================================
-- Since n8n was never deployed, we just add Lucid-L2 columns
-- ============================================================================

BEGIN;

-- ============================================================================
-- ADD LUCID-L2 COLUMNS TO WORKFLOWS
-- ============================================================================

ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS lucid_l2_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS lucid_l2_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lucid_l2_last_error TEXT;

-- ============================================================================
-- ADD LUCID-L2 COLUMNS TO WORKFLOW_EXECUTIONS
-- ============================================================================

ALTER TABLE workflow_executions
ADD COLUMN IF NOT EXISTS lucid_l2_execution_id TEXT;

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
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
-- ENSURE RLS POLICIES ARE IN PLACE
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
-- ADD DOCUMENTATION COMMENTS
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
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Added lucid_l2_workflow_id, lucid_l2_synced_at, lucid_l2_last_error to workflows
-- ✅ Added lucid_l2_execution_id to workflow_executions
-- ✅ Created optimized indexes for Lucid-L2 columns
-- ✅ Ensured RLS policies are in place
-- ✅ Added documentation comments
-- ============================================================================
