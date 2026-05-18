-- ============================================================================
-- AI Workflow Generation Tracking
-- ============================================================================
-- For rate limiting, analytics, and billing
-- Supports tier-based limits (Free: 10/hour, Plus: 30/hour, Business: 100/hour)
-- ============================================================================

BEGIN;

-- ============================================================================
-- CREATE AI GENERATIONS TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_workflow_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  tokens_used INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for rate limiting queries (recent generations per user)
CREATE INDEX IF NOT EXISTS idx_ai_gen_user_created 
ON ai_workflow_generations(user_id, created_at DESC);

-- Index for analytics (success rate tracking)
CREATE INDEX IF NOT EXISTS idx_ai_gen_success 
ON ai_workflow_generations(success, created_at DESC);

-- Index for user analytics (user's own history)
CREATE INDEX IF NOT EXISTS idx_ai_gen_user_success 
ON ai_workflow_generations(user_id, success);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE ai_workflow_generations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE RLS POLICIES
-- ============================================================================

-- Users can view their own AI generations
DROP POLICY IF EXISTS "Users can view their AI generations" ON ai_workflow_generations;
CREATE POLICY "Users can view their AI generations"
  ON ai_workflow_generations FOR SELECT
  USING (user_id = auth.uid());

-- Service role can insert AI generation records
DROP POLICY IF EXISTS "Service can insert AI generations" ON ai_workflow_generations;
CREATE POLICY "Service can insert AI generations"
  ON ai_workflow_generations FOR INSERT
  WITH CHECK (true);

-- Service role can update AI generation records
DROP POLICY IF EXISTS "Service can update AI generations" ON ai_workflow_generations;
CREATE POLICY "Service can update AI generations"
  ON ai_workflow_generations FOR UPDATE
  USING (true);

-- ============================================================================
-- ADD DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_workflow_generations IS 'Tracks AI workflow generation requests for rate limiting, analytics, and billing';
COMMENT ON COLUMN ai_workflow_generations.user_id IS 'User who requested the AI generation';
COMMENT ON COLUMN ai_workflow_generations.prompt IS 'Natural language prompt provided by user';
COMMENT ON COLUMN ai_workflow_generations.success IS 'Whether the generation was successful';
COMMENT ON COLUMN ai_workflow_generations.tokens_used IS 'GPT-4 tokens used (for billing and cost tracking)';
COMMENT ON COLUMN ai_workflow_generations.error_message IS 'Error message if generation failed';

-- ============================================================================
-- CREATE HELPER FUNCTION FOR CLEANUP
-- ============================================================================

-- Function to clean up old generation records (optional, for storage management)
CREATE OR REPLACE FUNCTION cleanup_old_ai_generations()
RETURNS void AS $$
BEGIN
  -- Delete records older than 90 days
  DELETE FROM ai_workflow_generations
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

COMMENT ON FUNCTION cleanup_old_ai_generations IS 'Deletes AI generation records older than 90 days to manage storage';

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- ✅ Created ai_workflow_generations table
-- ✅ Added indexes for rate limiting and analytics
-- ✅ Enabled RLS with appropriate policies
-- ✅ Added documentation comments
-- ✅ Created cleanup helper function
-- 
-- Next Steps:
-- 1. Run this migration in Supabase Dashboard
-- 2. Test AI generation endpoint: POST /api/ai/generate-workflow
-- 3. Monitor rate limits and usage stats
-- ============================================================================
