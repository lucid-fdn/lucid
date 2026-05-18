-- ============================================================================
-- Migration 042: DISABLE auto workspace creation trigger
-- ============================================================================
-- Problem: Old trigger still auto-creates workspaces with handle-based names
-- Solution: Drop the trigger completely - let onboarding create workspaces
-- ============================================================================

-- ============================================================================
-- Drop the auto-create workspace trigger
-- ============================================================================

DROP TRIGGER IF EXISTS auto_create_workspace_trigger ON profiles;

-- ============================================================================
-- Drop the function too (not needed anymore)
-- ============================================================================

DROP FUNCTION IF EXISTS auto_create_personal_workspace() CASCADE;

-- ============================================================================
-- Workspaces will now ONLY be created by:
-- 1. User onboarding (manual workspace creation with actual name)
-- 2. Workspace creation flow (team workspaces)
-- ============================================================================

-- Verification
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE '✅ Migration 042 complete';
  RAISE NOTICE '🔧 Auto workspace creation DISABLED';
  RAISE NOTICE '📝 Workspaces now created during onboarding';
  RAISE NOTICE '✅ Will use actual user name: "John Doe''s Workspace"';
  RAISE NOTICE '================================================';
END $$;
