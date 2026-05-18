-- ============================================================================
-- Complete Workspace: Projects, Environments, Agents, and Apps
-- ============================================================================
-- This creates the full hierarchy with proper Agent/App distinction:
-- - Agents = headless brains/workers (tools, planning, scheduling)
-- - Apps = user-facing products (UI/API surfaces wrapping agents)
-- Both properly scoped by {org, project, env}
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{3,}$'),
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT projects_unique_slug_per_org UNIQUE(org_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_project_per_org 
ON projects(org_id) WHERE is_default = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. ENVIRONMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('production', 'staging', 'development')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT environments_unique_name_per_project UNIQUE(project_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_env_per_project 
ON environments(project_id) WHERE is_default = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_environments_project_id ON environments(project_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. AGENTS TABLE (Headless Brains/Workers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workspace Scoping
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    env_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    
    -- Identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    
    -- Agent Configuration
    persona JSONB DEFAULT '{}', -- System prompt, role, behavior
    tools JSONB DEFAULT '[]', -- Available tools
    router_mode TEXT CHECK (router_mode IN ('pinned', 'assist', 'auto')) DEFAULT 'auto',
    memory_scope_id UUID, -- Link to memory map
    policy_pack_id UUID, -- Compliance/safety policies
    schedule_json JSONB, -- Cron/trigger config (optional)
    
    -- Settings
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT agents_unique_slug_per_project UNIQUE(project_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_scope 
ON agents(org_id, project_id, env_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_project 
ON agents(project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_created_at 
ON agents(created_at DESC);

-- ============================================================================
-- 4. APPS TABLE (User-Facing Products)
-- ============================================================================
CREATE TABLE IF NOT EXISTS apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workspace Scoping
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    env_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    
    -- Identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    
    -- App Configuration
    surfaces JSONB DEFAULT '["web"]', -- ['web', 'chat', 'slack', 'api']
    auth_mode TEXT CHECK (auth_mode IN ('org', 'end_user')) DEFAULT 'org',
    entry_route TEXT, -- Main entry point
    pricing_plan_id UUID, -- Optional billing plan
    
    -- Settings
    config JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT apps_unique_slug_per_project UNIQUE(project_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apps_scope 
ON apps(org_id, project_id, env_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_project 
ON apps(project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_public 
ON apps(is_public) WHERE deleted_at IS NULL AND is_active = true;

-- ============================================================================
-- 5. APP_AGENTS JOIN TABLE (Apps wrap 1..n Agents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_agents (
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('primary', 'helper', 'qa')) DEFAULT 'primary',
    order_index INTEGER DEFAULT 0,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (app_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_app_agents_app ON app_agents(app_id);
CREATE INDEX IF NOT EXISTS idx_app_agents_agent ON app_agents(agent_id);

-- ============================================================================
-- 6. AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_environments_updated_at
    BEFORE UPDATE ON environments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apps_updated_at
    BEFORE UPDATE ON apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. AUTO-CREATE DEFAULT PROJECT + ENV FOR NEW ORGS
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_project_and_env()
RETURNS TRIGGER AS $$
DECLARE
    new_project_id UUID;
BEGIN
    INSERT INTO projects (org_id, name, slug, is_default, created_by)
    VALUES (NEW.id, 'Default Project', 'default', true, NEW.created_by)
    RETURNING id INTO new_project_id;
    
    INSERT INTO environments (project_id, name, is_default, created_by)
    VALUES (new_project_id, 'production', true, NEW.created_by);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_default_project_and_env ON organizations;
CREATE TRIGGER trigger_create_default_project_and_env
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION create_default_project_and_env();

-- ============================================================================
-- 8. BACKFILL EXISTING ORGS
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
        INSERT INTO projects (org_id, name, slug, is_default, created_by)
        VALUES (org_record.id, 'Default Project', 'default', true, org_record.created_by)
        RETURNING id INTO new_project_id;
        
        INSERT INTO environments (project_id, name, is_default, created_by)
        VALUES (new_project_id, 'production', true, org_record.created_by);
        
        RAISE NOTICE 'Created workspace for org: %', org_record.id;
    END LOOP;
END $$;

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_default_project_id(org_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM projects 
    WHERE org_id = org_uuid AND is_default = true AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_default_env_id(project_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM environments 
    WHERE project_id = project_uuid AND is_default = true AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_current_workspace(p_user_id UUID, p_org_id UUID)
RETURNS TABLE(
    org_id UUID, project_id UUID, env_id UUID,
    org_name TEXT, project_name TEXT, env_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id, p.id, e.id,
        o.name, p.name, e.name
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    JOIN projects p ON o.id = p.org_id AND p.is_default = true AND p.deleted_at IS NULL
    JOIN environments e ON p.id = e.project_id AND e.is_default = true AND e.deleted_at IS NULL
    WHERE om.user_id = p_user_id AND o.id = p_org_id AND o.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- 10. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_org_isolation ON projects FOR ALL
USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
CREATE POLICY environments_project_isolation ON environments FOR ALL
USING (project_id IN (
    SELECT p.id FROM projects p
    JOIN organization_members om ON p.org_id = om.organization_id
    WHERE om.user_id = auth.uid()
));

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY agents_org_isolation ON agents FOR ALL
USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY apps_org_isolation ON apps FOR ALL
USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

ALTER TABLE app_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_agents_via_app ON app_agents FOR ALL
USING (app_id IN (
    SELECT a.id FROM apps a
    JOIN organization_members om ON a.org_id = om.organization_id
    WHERE om.user_id = auth.uid()
));

-- ============================================================================
-- 11. VERIFICATION
-- ============================================================================
DO $$
DECLARE
    total_orgs INT; total_projects INT; total_agents INT; total_apps INT;
BEGIN
    SELECT COUNT(*) INTO total_orgs FROM organizations;
    SELECT COUNT(*) INTO total_projects FROM projects;
    SELECT COUNT(*) INTO total_agents FROM agents;
    SELECT COUNT(*) INTO total_apps FROM apps;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Organizations: %', total_orgs;
    RAISE NOTICE 'Projects: %', total_projects;
    RAISE NOTICE 'Agents: %', total_agents;
    RAISE NOTICE 'Apps: %', total_apps;
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - projects (org containers)';
    RAISE NOTICE '  - environments (deployment targets)';
    RAISE NOTICE '  - agents (headless brains/workers) ✅';
    RAISE NOTICE '  - apps (user-facing products) ✅';
    RAISE NOTICE '  - app_agents (join table) ✅';
    RAISE NOTICE '==================================================';
END $$;
