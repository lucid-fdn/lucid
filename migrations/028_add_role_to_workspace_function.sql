-- ============================================================================
-- Add user_role to get_current_workspace function
-- ============================================================================
-- Fix: The function was returning workspace scope but not the user's role
-- This caused permission checks to fail on the frontend
-- ============================================================================

-- Drop the old function first (required when changing return type)
DROP FUNCTION IF EXISTS get_current_workspace(UUID, UUID);

-- Create the new function with user_role
CREATE OR REPLACE FUNCTION get_current_workspace(p_user_id UUID, p_org_id UUID)
RETURNS TABLE(
    org_id UUID,
    project_id UUID,
    env_id UUID,
    org_name TEXT,
    project_name TEXT,
    env_name TEXT,
    user_role TEXT  -- ✅ ADD: Return user's role
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as org_id,
        p.id as project_id,
        e.id as env_id,
        o.name as org_name,
        p.name as project_name,
        e.name as env_name,
        om.role::TEXT as user_role  -- ✅ ADD: Include user's role
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects_active p ON o.id = p.org_id AND p.is_default = true
    JOIN environments_active e ON p.id = e.project_id AND e.is_default = true
    WHERE om.user_id = p_user_id
      AND o.id = p_org_id;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    test_result RECORD;
BEGIN
    -- Test that function returns user_role
    RAISE NOTICE 'Testing get_current_workspace function...';
    
    -- Try to get first user's workspace
    SELECT * INTO test_result
    FROM get_current_workspace(
        (SELECT user_id FROM organization_members LIMIT 1),
        (SELECT organization_id FROM organization_members LIMIT 1)
    );
    
    IF test_result.user_role IS NULL THEN
        RAISE EXCEPTION 'Function does not return user_role!';
    END IF;
    
    RAISE NOTICE '✅ get_current_workspace now returns user_role: %', test_result.user_role;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MIGRATION 028 COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Fixed: get_current_workspace now includes user_role';
    RAISE NOTICE 'Result: Workspace profile forms will now work for owners/admins';
    RAISE NOTICE '==================================================';
END $$;
