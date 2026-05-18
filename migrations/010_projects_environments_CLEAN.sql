-- ============================================================================
-- Projects & Environments: Clean Migration (No Agents Table)
-- ============================================================================
-- This creates the workspace hierarchy without modifying resource tables
-- You can add scoping to resource tables later as needed
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Attributes
    name TEXT NOT NULL,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{3,}$'),
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT projects_unique_slug_per_org UNIQUE(org_id, slug),
    CONSTRAINT projects_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

-- Only ONE default project per org
CREATE UNIQUE INDEX IF NOT EXISTS one_default_project_per_org 
ON projects(org_id) 
WHERE is_default = true AND deleted_at IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. ENVIRONMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS environments (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Attributes
    name TEXT NOT NULL CHECK (name IN ('production', 'staging', 'development')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    
    -- Configuration
    config JSONB DEFAULT '{}',
    
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT environments_unique_name_per_project UNIQUE(project_id, name),
    CONSTRAINT environments_valid_config CHECK (jsonb_typeof(config) = 'object')
);

-- Only ONE default environment per project
CREATE UNIQUE INDEX IF NOT EXISTS one_default_env_per_project 
ON environments(project_id) 
WHERE is_default = true AND deleted_at IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_environments_project_id ON environments(project_id) WHERE deleted_at IS NULL;

-- Auto-update updated_at
CREATE TRIGGER update_environments_updated_at
    BEFORE UPDATE ON environments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. AUTO-CREATE DEFAULT PROJECT + ENV FOR NEW ORGS
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_project_and_env()
RETURNS TRIGGER AS $$
DECLARE
    new_project_id UUID;
BEGIN
    -- Create default project
    INSERT INTO projects (
        org_id, 
        name, 
        slug, 
        is_default,
        created_by
    )
    VALUES (
        NEW.id, 
        'Default Project', 
        'default', 
        true,
        NEW.created_by
    )
    RETURNING id INTO new_project_id;
    
    -- Create production environment
    INSERT INTO environments (
        project_id, 
        name, 
        is_default,
        created_by
    )
    VALUES (
        new_project_id, 
        'production', 
        true,
        NEW.created_by
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_create_default_project_and_env ON organizations;
CREATE TRIGGER trigger_create_default_project_and_env
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION create_default_project_and_env();

-- ============================================================================
-- 4. BACKFILL EXISTING ORGS
-- ============================================================================
DO $$
DECLARE
    org_record RECORD;
    new_project_id UUID;
BEGIN
    FOR org_record IN 
        SELECT id, created_by 
        FROM organizations 
        WHERE NOT EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.org_id = organizations.id 
              AND projects.is_default = true
        )
    LOOP
        -- Create default project
        INSERT INTO projects (org_id, name, slug, is_default, created_by)
        VALUES (org_record.id, 'Default Project', 'default', true, org_record.created_by)
        RETURNING id INTO new_project_id;
        
        -- Create production environment
        INSERT INTO environments (project_id, name, is_default, created_by)
        VALUES (new_project_id, 'production', true, org_record.created_by);
        
        RAISE NOTICE 'Created default project for org: %', org_record.id;
    END LOOP;
END $$;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Get default project for org
CREATE OR REPLACE FUNCTION get_default_project_id(org_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM projects 
    WHERE org_id = org_uuid 
      AND is_default = true 
      AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get default env for project
CREATE OR REPLACE FUNCTION get_default_env_id(project_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM environments 
    WHERE project_id = project_uuid 
      AND is_default = true 
      AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get workspace (org + project + env)
CREATE OR REPLACE FUNCTION get_current_workspace(user_id UUID, org_id UUID)
RETURNS TABLE(
    org_id UUID,
    project_id UUID,
    env_id UUID,
    org_name TEXT,
    project_name TEXT,
    env_name TEXT
) AS $$
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
    JOIN projects p ON o.id = p.org_id AND p.is_default = true AND p.deleted_at IS NULL
    JOIN environments e ON p.id = e.project_id AND e.is_default = true AND e.deleted_at IS NULL
    WHERE om.user_id = $1
      AND o.id = $2
      AND o.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- 6. ENABLE RLS
-- ============================================================================

-- Projects: Users see only their org's projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_org_isolation ON projects
    FOR ALL
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Environments: Users see only their project's envs
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY environments_project_isolation ON environments
    FOR ALL
    USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN organization_members om ON p.org_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 7. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    missing_count INT;
    total_orgs INT;
    total_projects INT;
BEGIN
    -- Count orgs
    SELECT COUNT(*) INTO total_orgs FROM organizations;
    
    -- Verify all orgs have default projects
    SELECT COUNT(*) INTO missing_count
    FROM organizations o
    WHERE NOT EXISTS (
        SELECT 1 FROM projects p
        WHERE p.org_id = o.id 
          AND p.is_default = true
          AND p.deleted_at IS NULL
    );
    
    IF missing_count > 0 THEN
        RAISE EXCEPTION '% organizations missing default projects!', missing_count;
    END IF;
    
    -- Count projects
    SELECT COUNT(*) INTO total_projects FROM projects;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Organizations: %', total_orgs;
    RAISE NOTICE 'Projects created: %', total_projects;
    RAISE NOTICE 'All orgs have default projects ✓';
    RAISE NOTICE 'All projects have production environment ✓';
    RAISE NOTICE '==================================================';
END $$;

-- ============================================================================
-- DONE!
-- ============================================================================
-- Next: Restart your app and check logs
-- You'll see: [ROOT LAYOUT] ✅ Server fetched org: { hasOrg: true, ... }
-- ============================================================================
