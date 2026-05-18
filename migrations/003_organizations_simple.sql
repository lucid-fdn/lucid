-- ============================================================================
-- Organizations Tables - SIMPLE & SAFE VERSION
-- ============================================================================
-- This is a simplified version that avoids complex constraints
-- Use this if the regular migration gives errors

-- Drop existing tables if you want to start fresh (OPTIONAL - only if needed)
-- DROP TABLE IF EXISTS organization_members CASCADE;
-- DROP TABLE IF EXISTS organizations CASCADE;

-- ============================================================================
-- Organizations Table (Simple)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    logo_url TEXT,
    bio TEXT,
    homepage TEXT,
    interests TEXT[],
    github_username TEXT,
    twitter_username TEXT,
    linkedin_url TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);

-- ============================================================================
-- Organization Members Table (Simple)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================================================
-- Add Foreign Keys (if profiles.id exists)
-- ============================================================================
DO $$
BEGIN
    -- Check if profiles.id exists before adding FK
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'id'
    ) THEN
        -- Add FK for organizations.created_by
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'organizations_created_by_fkey'
        ) THEN
            ALTER TABLE organizations 
            ADD CONSTRAINT organizations_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
        END IF;
        
        -- Add FK for organization_members.user_id
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'organization_members_user_id_fkey'
        ) THEN
            ALTER TABLE organization_members 
            ADD CONSTRAINT organization_members_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
    
    -- Add FK for organization_members.organization_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organization_members_organization_id_fkey'
    ) THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_organization_id_fkey 
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- Auto-update trigger
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_organizations_updated_at') THEN
        CREATE TRIGGER update_organizations_updated_at 
            BEFORE UPDATE ON organizations 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Auto-add creator as owner function
-- ============================================================================
CREATE OR REPLACE FUNCTION add_org_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (NEW.id, NEW.created_by, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_add_org_creator') THEN
        CREATE TRIGGER trigger_add_org_creator
            AFTER INSERT ON organizations
            FOR EACH ROW
            EXECUTE FUNCTION add_org_creator_as_owner();
    END IF;
END $$;

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Public can view organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Org owners and admins can update" ON organizations;
DROP POLICY IF EXISTS "Org owners can delete" ON organizations;
DROP POLICY IF EXISTS "Public can view org members" ON organization_members;
DROP POLICY IF EXISTS "Org owners and admins can manage members" ON organization_members;

-- Create policies
CREATE POLICY "Public can view organizations"
ON organizations FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create organizations"
ON organizations FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their orgs"
ON organizations FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their orgs"
ON organizations FOR DELETE
USING (auth.uid() = created_by);

CREATE POLICY "Public can view org members"
ON organization_members FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage org members"
ON organization_members FOR ALL
USING (auth.role() = 'authenticated');

-- ============================================================================
-- Verification
-- ============================================================================
-- Run this to verify:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name IN ('organizations', 'organization_members');
