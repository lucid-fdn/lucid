-- ============================================================================
-- Organizations Tables - SAFE FOR EXISTING TABLES
-- ============================================================================
-- This migration creates new tables, it never modifies existing data
-- Uses IF NOT EXISTS to avoid conflicts with existing tables

-- ⚠️ PREREQUISITE CHECK: Verify profiles table exists with id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'id'
    ) THEN
        RAISE EXCEPTION 'profiles table must have an "id" column. Please check your profiles table structure.';
    END IF;
END $$;

-- ============================================================================
-- Organizations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('company', 'lab', 'university', 'nonprofit', 'community', 'other')),
    logo_url TEXT,
    bio TEXT,
    homepage TEXT,
    interests TEXT[],
    github_username TEXT,
    twitter_username TEXT,
    linkedin_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add created_by column if it doesn't exist
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE organizations ADD COLUMN created_by UUID;
        
        -- If table is empty, make it NOT NULL
        SELECT COUNT(*) INTO row_count FROM organizations;
        IF row_count = 0 THEN
            ALTER TABLE organizations ALTER COLUMN created_by SET NOT NULL;
        END IF;
    END IF;
END $$;

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organizations_created_by_fkey'
    ) THEN
        ALTER TABLE organizations 
        ADD CONSTRAINT organizations_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);

-- ============================================================================
-- Organization Members Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,  -- Foreign keys added below after table exists
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organization_members_organization_id_user_id_key'
    ) THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_organization_id_user_id_key 
        UNIQUE (organization_id, user_id);
    END IF;
END $$;

-- Add foreign key constraints only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organization_members_organization_id_fkey'
    ) THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_organization_id_fkey 
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organization_members_user_id_fkey'
    ) THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================================================
-- Triggers for auto-updating timestamps (Safe - checks if exists)
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
-- Function to auto-add creator as owner
-- ============================================================================
CREATE OR REPLACE FUNCTION add_org_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-add creator as owner (Safe - checks if exists)
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
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Everyone can view organizations
CREATE POLICY "Public can view organizations"
ON organizations FOR SELECT
USING (true);

-- Authenticated users can create organizations
CREATE POLICY "Authenticated users can create organizations"
ON organizations FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = created_by);

-- Organization owners and admins can update
CREATE POLICY "Org owners and admins can update"
ON organizations FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
);

-- Only owners can delete organizations
CREATE POLICY "Org owners can delete"
ON organizations FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
);

-- Everyone can view organization members
CREATE POLICY "Public can view org members"
ON organization_members FOR SELECT
USING (true);

-- Owners and admins can manage members
CREATE POLICY "Org owners and admins can manage members"
ON organization_members FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM organization_members AS om
        WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
);

-- ============================================================================
-- Verification
-- ============================================================================
-- Run this to verify tables were created:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('organizations', 'organization_members');
