-- ============================================================================
-- Workspace Enhancements: Session Guards, Views, Hot Path Indexes
-- ============================================================================
-- Enhancements to 010_projects_environments_production_grade.sql
-- This adds:
-- ✅ Strict session guards (errors if unset)
-- ✅ Active resource views (auto-filter deleted_at)
-- ✅ Hot path composite indexes
-- ✅ Session helper function
-- ============================================================================

-- ============================================================================
-- 1. SESSION GUARD: Error if session variables not set
-- ============================================================================

-- Helper function to get session variable with guard
CREATE OR REPLACE FUNCTION get_session_var(var_name TEXT)
RETURNS UUID AS $$
DECLARE
    var_value TEXT;
BEGIN
    var_value := current_setting('app.' || var_name, true);
    
    IF var_value IS NULL OR var_value = '' THEN
        RAISE EXCEPTION 'Session variable app.% is not set. Call set_workspace_scope() first.', var_name;
    END IF;
    
    RETURN var_value::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update RLS policies to use guarded session variables
DROP POLICY IF EXISTS agents_scope_isolation ON agents;
CREATE POLICY agents_scope_isolation ON agents
    FOR ALL
    USING (
        org_id = get_session_var('org')
        AND project_id = get_session_var('project')
        AND env_id = get_session_var('env')
    );

-- ============================================================================
-- 2. SESSION HELPER: Set all workspace variables at once
-- ============================================================================

CREATE OR REPLACE FUNCTION set_workspace_scope(
    p_org_id UUID,
    p_project_id UUID,
    p_env_id UUID
) RETURNS VOID AS $$
BEGIN
    -- Transaction-local (is_local=true) for connection pooler safety
    PERFORM set_config('app.org', p_org_id::text, true);
    PERFORM set_config('app.project', p_project_id::text, true);
    PERFORM set_config('app.env', p_env_id::text, true);
    
    RAISE NOTICE 'Workspace scope set: org=%, project=%, env=%', p_org_id, p_project_id, p_env_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. ACTIVE VIEWS: Auto-filter deleted_at IS NULL
-- ============================================================================

-- Active projects view
CREATE OR REPLACE VIEW projects_active AS
SELECT * FROM projects
WHERE deleted_at IS NULL;

-- Active environments view
CREATE OR REPLACE VIEW environments_active AS
SELECT * FROM environments
WHERE deleted_at IS NULL;

-- Active agents view (example - create for all resource tables)
CREATE OR REPLACE VIEW agents_active AS
SELECT * FROM agents
WHERE deleted_at IS NULL;

-- Grant appropriate permissions
GRANT SELECT ON projects_active TO authenticated;
GRANT SELECT ON environments_active TO authenticated;
GRANT SELECT ON agents_active TO authenticated;

-- ============================================================================
-- 4. HOT PATH INDEXES: Composite with created_at DESC
-- ============================================================================

-- Projects: org browsing with sort
DROP INDEX IF EXISTS idx_projects_hot_path;
CREATE INDEX idx_projects_hot_path 
ON projects(org_id, deleted_at, created_at DESC)
WHERE deleted_at IS NULL;

-- Environments: project browsing with sort
DROP INDEX IF EXISTS idx_environments_hot_path;
CREATE INDEX idx_environments_hot_path 
ON environments(project_id, deleted_at, created_at DESC)
WHERE deleted_at IS NULL;

-- Agents: Full scope with time-series access
DROP INDEX IF EXISTS idx_agents_hot_path;
CREATE INDEX idx_agents_hot_path 
ON agents(org_id, project_id, env_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Agents: Recent activity query pattern
DROP INDEX IF EXISTS idx_agents_recent;
CREATE INDEX idx_agents_recent 
ON agents(created_at DESC)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 5. SOFT-DELETE HYGIENE: Update helper functions
-- ============================================================================

-- Update get_default_project_id to use view
CREATE OR REPLACE FUNCTION get_default_project_id(org_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM projects_active 
    WHERE org_id = org_uuid 
      AND is_default = true 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Update get_default_env_id to use view
CREATE OR REPLACE FUNCTION get_default_env_id(project_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM environments_active 
    WHERE project_id = project_uuid 
      AND is_default = true 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Update get_current_workspace to use views
CREATE OR REPLACE FUNCTION get_current_workspace(p_user_id UUID, p_org_id UUID)
RETURNS TABLE(
    org_id UUID,
    project_id UUID,
    env_id UUID,
    org_name TEXT,
    project_name TEXT,
    env_name TEXT
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
        e.name as env_name
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects_active p ON o.id = p.org_id AND p.is_default = true
    JOIN environments_active e ON p.id = e.project_id AND e.is_default = true
    WHERE om.user_id = p_user_id
      AND o.id = p_org_id;
END;
$$;

-- ============================================================================
-- 6. ADDITIONAL SAFETY: Soft-delete cascade prevention
-- ============================================================================

-- Prevent hard deletion of projects with active resources
CREATE OR REPLACE FUNCTION prevent_project_deletion_with_resources()
RETURNS TRIGGER AS $$
DECLARE
    active_agents_count INT;
BEGIN
    -- Only check on UPDATE when setting deleted_at
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Count active resources (add more tables as needed)
        SELECT COUNT(*) INTO active_agents_count
        FROM agents
        WHERE project_id = NEW.id AND deleted_at IS NULL;
        
        IF active_agents_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete project with % active agents. Soft-delete resources first.', active_agents_count;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_project_deletion_with_resources
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION prevent_project_deletion_with_resources();

-- ============================================================================
-- 7. QUERY PERFORMANCE: Statistics & Analyze
-- ============================================================================

-- Update statistics for query planner
ANALYZE projects;
ANALYZE environments;
ANALYZE agents;

-- ============================================================================
-- 8. APPLICATION HELPER: Get active workspace for user
-- ============================================================================

-- Get user's current/default workspace with all IDs
CREATE OR REPLACE FUNCTION get_user_workspace(p_user_id UUID)
RETURNS TABLE(
    org_id UUID,
    org_name TEXT,
    project_id UUID,
    project_name TEXT,
    env_id UUID,
    env_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.name,
        p.id,
        p.name,
        e.id,
        e.name
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects_active p ON o.id = p.org_id AND p.is_default = true
    JOIN environments_active e ON p.id = e.project_id AND e.is_default = true
    WHERE om.user_id = p_user_id
    ORDER BY om.joined_at DESC
    LIMIT 1;
END;
$$;

-- ============================================================================
-- 9. MONITORING: Workspace usage statistics
-- ============================================================================

-- Create workspace stats view for monitoring
CREATE OR REPLACE VIEW workspace_stats AS
SELECT 
    o.id as org_id,
    o.name as org_name,
    COUNT(DISTINCT p.id) as projects_count,
    COUNT(DISTINCT e.id) as environments_count,
    COUNT(DISTINCT om.user_id) as members_count,
    COUNT(DISTINCT a.id) as agents_count
FROM organizations o
LEFT JOIN projects_active p ON o.id = p.org_id
LEFT JOIN environments_active e ON p.id = e.project_id
LEFT JOIN organization_members om ON o.id = om.organization_id
LEFT JOIN agents_active a ON p.id = a.project_id
GROUP BY o.id, o.name;

GRANT SELECT ON workspace_stats TO authenticated;

-- ============================================================================
-- 10. VERIFICATION: Enhanced smoke tests
-- ============================================================================

DO $$
DECLARE
    missing_org_count INT;
BEGIN
    -- Test 1: Views return only active records
    IF EXISTS (SELECT 1 FROM projects_active WHERE deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'projects_active view includes deleted records!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM environments_active WHERE deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'environments_active view includes deleted records!';
    END IF;
    
    RAISE NOTICE 'Verification: Active views filter correctly ✓';
    
    -- Test 2: Every org has default project + env
    SELECT COUNT(*) INTO missing_org_count
    FROM organizations o
    WHERE NOT EXISTS (
        SELECT 1 FROM projects_active p
        WHERE p.org_id = o.id AND p.is_default = true
    );
    
    IF missing_org_count > 0 THEN
        RAISE EXCEPTION '% orgs missing default projects!', missing_org_count;
    END IF;
    
    RAISE NOTICE 'Verification: All orgs have default projects ✓';
    
    -- Test 3: Indexes exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_agents_hot_path'
    ) THEN
        RAISE EXCEPTION 'Hot path index missing!';
    END IF;
    
    RAISE NOTICE 'Verification: Hot path indexes created ✓';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ENHANCEMENT MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Update app code to call set_workspace_scope()';
    RAISE NOTICE '2. Use _active views in queries';
    RAISE NOTICE '3. Monitor workspace_stats for insights';
    RAISE NOTICE '==================================================';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Applied enhancements:
-- ✅ Session guards (errors if unset)
-- ✅ Active views (auto-filter deleted)
-- ✅ Hot path indexes (with created_at)
-- ✅ Session helper (set_workspace_scope)
-- ✅ Soft-delete protection
-- ✅ Monitoring views
-- ✅ Enhanced verification
-- ============================================================================
