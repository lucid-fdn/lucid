-- Migration: Clean up orphaned organization_members (Raijin Labs issue)
-- Issue: User 439d8b09-0f47-49d2-8ab5-38e08a156d55 is linked to org 2867615c-d8f5-4338-83d9-d79fe44c0c1e (Raijin Labs)
-- But this org doesn't exist in organization_members query results
-- This is likely from old test data where a different wallet created the org

-- ============================================================================
-- STEP 1: Identify orphaned memberships
-- ============================================================================

DO $$
DECLARE
  v_orphaned_count INTEGER;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE '[CLEANUP] 🔍 Checking for orphaned organization memberships...';
  
  -- Count memberships where the organization doesn't exist
  SELECT COUNT(*) INTO v_orphaned_count
  FROM organization_members om
  LEFT JOIN organizations o ON o.id = om.organization_id
  WHERE o.id IS NULL;
  
  RAISE NOTICE '[CLEANUP] Found % orphaned memberships', v_orphaned_count;
  
  IF v_orphaned_count > 0 THEN
    RAISE NOTICE '[CLEANUP] ⚠️ Orphaned memberships will be deleted';
  ELSE
    RAISE NOTICE '[CLEANUP] ✅ No orphaned memberships found';
  END IF;
  
  RAISE NOTICE '==================================================';
END $$;

-- ============================================================================
-- STEP 2: Delete orphaned memberships
-- ============================================================================

DELETE FROM organization_members om
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.id = om.organization_id
);

-- ============================================================================
-- STEP 3: Verify cleanup
-- ============================================================================

DO $$
DECLARE
  v_remaining_orphaned INTEGER;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE '[CLEANUP] 🔍 Verifying cleanup...';
  
  SELECT COUNT(*) INTO v_remaining_orphaned
  FROM organization_members om
  LEFT JOIN organizations o ON o.id = om.organization_id
  WHERE o.id IS NULL;
  
  IF v_remaining_orphaned = 0 THEN
    RAISE NOTICE '[CLEANUP] ✅ All orphaned memberships cleaned up';
  ELSE
    RAISE WARNING '[CLEANUP] ⚠️ Still have % orphaned memberships!', v_remaining_orphaned;
  END IF;
  
  RAISE NOTICE '==================================================';
END $$;

-- ============================================================================
-- STEP 4: Add constraint to prevent future orphaned memberships
-- ============================================================================

-- Ensure foreign key constraint exists (should already exist, but let's be sure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'organization_members_organization_id_fkey'
    AND table_name = 'organization_members'
  ) THEN
    ALTER TABLE organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey
    FOREIGN KEY (organization_id) 
    REFERENCES organizations(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE '[CLEANUP] ✅ Added foreign key constraint';
  ELSE
    RAISE NOTICE '[CLEANUP] ✅ Foreign key constraint already exists';
  END IF;
END $$;

RAISE NOTICE '==================================================';
RAISE NOTICE '✅ Migration 034 complete';
RAISE NOTICE '';
RAISE NOTICE '📋 WHAT WAS FIXED:';
RAISE NOTICE '1. Deleted orphaned organization_members entries';
RAISE NOTICE '2. Verified foreign key constraint exists';
RAISE NOTICE '3. Future orphaned memberships prevented by CASCADE';
RAISE NOTICE '';
RAISE NOTICE '🔍 WHY THIS HAPPENED:';
RAISE NOTICE 'Old test data where organizations were deleted but memberships remained';
RAISE NOTICE 'This caused UI to show workspaces that don''t actually exist';
RAISE NOTICE '';
RAISE NOTICE '==================================================';
