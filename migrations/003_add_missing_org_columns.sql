-- ============================================================================
-- Add Missing Columns to Existing Organizations Table
-- ============================================================================
-- Your existing table has: id, slug, display_name, legal_name, logo_url, 
-- banner_url, website_url, location, socials, verified, bio, created_at, updated_at
--
-- Our code needs: created_by, name, type, homepage, interests, 
-- github_username, twitter_username, linkedin_url

-- ============================================================================
-- Add Missing Columns (only if they don't exist)
-- ============================================================================

-- Add created_by (needed for ownership tracking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE organizations ADD COLUMN created_by UUID;
    END IF;
END $$;

-- Add name (alias for display_name - our code uses this)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'name'
    ) THEN
        ALTER TABLE organizations ADD COLUMN name TEXT;
        -- Copy from display_name if it has data
        UPDATE organizations SET name = display_name WHERE display_name IS NOT NULL;
    END IF;
END $$;

-- Add type (organization type)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'type'
    ) THEN
        ALTER TABLE organizations ADD COLUMN type TEXT DEFAULT 'company';
    END IF;
END $$;

-- Add homepage (alias for website_url - our code uses this)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'homepage'
    ) THEN
        ALTER TABLE organizations ADD COLUMN homepage TEXT;
        -- Copy from website_url if it has data
        UPDATE organizations SET homepage = website_url WHERE website_url IS NOT NULL;
    END IF;
END $$;

-- Add interests array
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'interests'
    ) THEN
        ALTER TABLE organizations ADD COLUMN interests TEXT[];
    END IF;
END $$;

-- Add social links (our code expects these separate fields)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'github_username'
    ) THEN
        ALTER TABLE organizations ADD COLUMN github_username TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'twitter_username'
    ) THEN
        ALTER TABLE organizations ADD COLUMN twitter_username TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'linkedin_url'
    ) THEN
        ALTER TABLE organizations ADD COLUMN linkedin_url TEXT;
    END IF;
END $$;

-- ============================================================================
-- Create Organization Members Table (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint separately (in case table already exists)
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================================================
-- Add Foreign Keys (if profiles.id exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'id'
    ) THEN
        -- FK for organizations.created_by
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'organizations_created_by_fkey'
        ) THEN
            ALTER TABLE organizations 
            ADD CONSTRAINT organizations_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
        END IF;
        
        -- FK for organization_members.user_id
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'organization_members_user_id_fkey'
        ) THEN
            ALTER TABLE organization_members 
            ADD CONSTRAINT organization_members_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
    
    -- FK for organization_members.organization_id
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
-- Triggers (if needed)
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
-- Success!
-- ============================================================================
-- Verify columns were added:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'organizations'
-- ORDER BY ordinal_position;
