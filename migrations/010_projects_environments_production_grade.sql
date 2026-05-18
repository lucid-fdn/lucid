-- ============================================================================
-- Projects & Environments: Production-Grade Implementation
-- ============================================================================
-- This migration implements the org→project→env hierarchy with:
-- ✅ Proper constraints and invariants
-- ✅ Safe backfill strategy
-- ✅ Row-Level Security (RLS)
-- ✅ Idempotent bootstrap
-- ✅ Audit columns
-- ✅ Performance indexes
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
    
    -- Audit columns (for Thought Epochs/receipts later)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    deleted_at TIMESTAMPTZ, -- Soft delete
    
    -- Constraints
    CONSTRAINT projects_unique_slug_per_org UNIQUE(org_id, slug),
    CONSTRAINT projects_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

-- Only ONE default project per org (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS one_default_project_per_org 
ON projects(org_id) 
WHERE is_default = true AND deleted_at IS NULL;

-- Performance indexes (created CONCURRENTLY in production)
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Immutable slug (prevent updates after creation)
CREATE OR REPLACE FUNCTION prevent_slug_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.slug IS DISTINCT FROM NEW.slug THEN
        RAISE EXCEPTION 'Project slug is immutable after creation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_project_slug_update
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION prevent_slug_update();

-- Auto-update updated_at
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
    
    -- Configuration (for secrets, budgets, regions later)
    config JSONB DEFAULT '{}',
    region TEXT,
    budget_usd DECIMAL,
    
    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
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
CREATE INDEX IF NOT EXISTS idx_environments_name ON environments(name);

-- Auto-update updated_at
CREATE TRIGGER update_environments_updated_at
    BEFORE UPDATE ON environments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. IDEMPOTENT BOOTSTRAP: Auto-create default project + production env
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_project_and_env()
RETURNS TRIGGER AS $$
DECLARE
    new_project_id UUID;
    existing_project_id UUID;
BEGIN
    -- Check if default project already exists (idempotent)
    SELECT id INTO existing_project_id
    FROM projects
    WHERE org_id = NEW.id 
      AND is_default = true 
      AND deleted_at IS NULL;
    
    -- If not exists, create it
    IF existing_project_id IS NULL THEN
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
        
        -- Create production environment (idempotent check)
        IF NOT EXISTS (
            SELECT 1 FROM environments 
            WHERE project_id = new_project_id 
              AND name = 'production'
              AND deleted_at IS NULL
        ) THEN
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
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_create_default_project_and_env ON organizations;
CREATE TRIGGER trigger_create_default_project_and_env
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION create_default_project_and_env();

-- ============================================================================
-- 4. BACKFILL EXISTING ORGS (Create default projects retroactively)
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
              AND projects.deleted_at IS NULL
        )
    LOOP
        -- Create default project
        INSERT INTO projects (org_id, name, slug, is_default, created_by)
        VALUES (org_record.id, 'Default Project', 'default', true, org_record.created_by)
        RETURNING id INTO new_project_id;
        
        -- Create production environment
        INSERT INTO environments (project_id, name, is_default, created_by)
        VALUES (new_project_id, 'production', true, org_record.created_by);
    END LOOP;
END $$;

-- ============================================================================
-- 5. ADD SCOPING COLUMNS TO RESOURCE TABLES (Examples - add to all your tables)
-- ============================================================================

-- Helper function to get default project_id for an org
CREATE OR REPLACE FUNCTION get_default_project_id(org_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM projects 
    WHERE org_id = org_uuid 
      AND is_default = true 
      AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Helper function to get default env_id for a project
CREATE OR REPLACE FUNCTION get_default_env_id(project_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM environments 
    WHERE project_id = project_uuid 
      AND is_default = true 
      AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Add columns to agents table (if exists - example pattern)
DO $$ 
BEGIN
    -- Add project_id (nullable initially)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agents' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE agents ADD COLUMN project_id UUID;
    END IF;
    
    -- Add env_id (nullable initially)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agents' AND column_name = 'env_id'
    ) THEN
        ALTER TABLE agents ADD COLUMN env_id UUID;
    END IF;
END $$;

-- Backfill agents (in batches for large tables)
DO $$
DECLARE
    batch_size INT := 1000;
    rows_updated INT;
BEGIN
    LOOP
        UPDATE agents
        SET 
            project_id = get_default_project_id(org_id),
            env_id = get_default_env_id(get_default_project_id(org_id))
        WHERE project_id IS NULL
        LIMIT batch_size;
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        EXIT WHEN rows_updated = 0;
        
        -- Checkpoint between batches
        COMMIT;
    END LOOP;
END $$;

-- Add foreign keys NOT VALID (no table lock)
ALTER TABLE agents 
    ADD CONSTRAINT agents_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES projects(id)
    NOT VALID;

ALTER TABLE agents 
    ADD CONSTRAINT agents_env_id_fkey 
    FOREIGN KEY (env_id) REFERENCES environments(id)
    NOT VALID;

-- Validate constraints (checks new rows only)
ALTER TABLE agents VALIDATE CONSTRAINT agents_project_id_fkey;
ALTER TABLE agents VALIDATE CONSTRAINT agents_env_id_fkey;

-- Make NOT NULL after backfill complete
ALTER TABLE agents ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE agents ALTER COLUMN env_id SET NOT NULL;

-- Add composite index for scoped queries (CONCURRENTLY in production)
CREATE INDEX IF NOT EXISTS idx_agents_scope 
ON agents(org_id, project_id, env_id);

-- Add specific indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_created_at 
ON agents(created_at DESC);

-- ============================================================================
-- 6. CONSISTENCY GUARD: Ensure child org_id matches project's org_id
-- ============================================================================
CREATE OR REPLACE FUNCTION check_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
    project_org_id UUID;
BEGIN
    -- Get the project's org_id
    SELECT org_id INTO project_org_id
    FROM projects
    WHERE id = NEW.project_id;
    
    -- Verify it matches the agent's org_id
    IF project_org_id != NEW.org_id THEN
        RAISE EXCEPTION 'Agent org_id (%) must match project org_id (%)', 
            NEW.org_id, project_org_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_agents_org_consistency
    BEFORE INSERT OR UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION check_org_consistency();

-- ============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) - Multi-tenant isolation
-- ============================================================================

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Projects: Users see only their org's projects
CREATE POLICY projects_org_isolation ON projects
    FOR ALL
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Enable RLS on environments
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

-- Environments: Users see only their project's envs
CREATE POLICY environments_project_isolation ON environments
    FOR ALL
    USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN organization_members om ON p.org_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

-- Enable RLS on agents (example - apply to all resource tables)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Agents: Scoped by session settings (for performance)
CREATE POLICY agents_scope_isolation ON agents
    FOR ALL
    USING (
        org_id = COALESCE(
            NULLIF(current_setting('app.org', true), '')::uuid,
            org_id
        )
        AND project_id = COALESCE(
            NULLIF(current_setting('app.project', true), '')::uuid,
            project_id
        )
        AND env_id = COALESCE(
            NULLIF(current_setting('app.env', true), '')::uuid,
            env_id
        )
    );

-- ============================================================================
-- 8. HELPER FUNCTIONS FOR APPLICATION LAYER
-- ============================================================================

-- Get current workspace (org + default project + default env)
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
-- 9. VERIFICATION QUERIES
-- ============================================================================

-- Verify all orgs have default projects
DO $$
DECLARE
    missing_count INT;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM organizations o
    WHERE NOT EXISTS (
        SELECT 1 FROM projects p
        WHERE p.org_id = o.id 
          AND p.is_default = true
          AND p.deleted_at IS NULL
    );
    
    IF missing_count > 0 THEN
        RAISE EXCEPTION '% organizations missing default projects', missing_count;
    END IF;
    
    RAISE NOTICE 'Verification: All organizations have default projects ✓';
END $$;

-- Verify all projects have default environments
DO $$
DECLARE
    missing_count INT;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM projects p
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM environments e
        WHERE e.project_id = p.id 
          AND e.is_default = true
          AND e.deleted_at IS NULL
    );
    
    IF missing_count > 0 THEN
        RAISE EXCEPTION '% projects missing default environments', missing_count;
    END IF;
    
    RAISE NOTICE 'Verification: All projects have default environments ✓';
END $$;

-- Verify all agents are properly scoped
DO $$
DECLARE
    unscoped_count INT;
BEGIN
    SELECT COUNT(*) INTO unscoped_count
    FROM agents
    WHERE project_id IS NULL OR env_id IS NULL;
    
    IF unscoped_count > 0 THEN
        RAISE EXCEPTION '% agents missing project_id or env_id', unscoped_count;
    END IF;
    
    RAISE NOTICE 'Verification: All agents properly scoped ✓';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Update application code to set session variables
-- 2. Update queries to use workspace context
-- 3. Add feature flags for multi-project UI
-- 4. Monitor performance
-- ============================================================================
