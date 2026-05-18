-- ============================================================================
-- FINAL WORKING MIGRATION - Based on YOUR actual DB structure
-- ============================================================================
-- Your organization_members has: id, org_id, user_id, role, created_at
-- Our code expects: organization_id, joined_at
--
-- Your organizations has: id, slug, display_name, legal_name, logo_url, 
-- banner_url, website_url, location, socials, verified, bio, created_at, updated_at
-- Our code expects: created_by, name, type, homepage, interests, 
-- github_username, twitter_username, linkedin_url

-- ============================================================================
-- 1. Add missing columns to organizations table
-- ============================================================================

DO $$
BEGIN
    -- Add created_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'created_by') THEN
        ALTER TABLE organizations ADD COLUMN created_by UUID;
    END IF;
    
    -- Add name (our code uses this)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'name') THEN
        ALTER TABLE organizations ADD COLUMN name TEXT;
        UPDATE organizations SET name = display_name WHERE display_name IS NOT NULL;
    END IF;
    
    -- Add type
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'type') THEN
        ALTER TABLE organizations ADD COLUMN type TEXT DEFAULT 'company';
    END IF;
    
    -- Add homepage (our code uses this)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'homepage') THEN
        ALTER TABLE organizations ADD COLUMN homepage TEXT;
        UPDATE organizations SET homepage = website_url WHERE website_url IS NOT NULL;
    END IF;
    
    -- Add interests
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'interests') THEN
        ALTER TABLE organizations ADD COLUMN interests TEXT[];
    END IF;
    
    -- Add social fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'github_username') THEN
        ALTER TABLE organizations ADD COLUMN github_username TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'twitter_username') THEN
        ALTER TABLE organizations ADD COLUMN twitter_username TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organizations' AND column_name = 'linkedin_url') THEN
        ALTER TABLE organizations ADD COLUMN linkedin_url TEXT;
    END IF;
END $$;

-- ============================================================================
-- 2. Add alias columns to organization_members (for compatibility)
-- ============================================================================

DO $$
BEGIN
    -- Add organization_id (alias for org_id)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organization_members' AND column_name = 'organization_id') THEN
        ALTER TABLE organization_members ADD COLUMN organization_id UUID;
        -- Copy existing data
        UPDATE organization_members SET organization_id = org_id;
    END IF;
    
    -- Add joined_at (alias for created_at) 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'organization_members' AND column_name = 'joined_at') THEN
        ALTER TABLE organization_members ADD COLUMN joined_at TIMESTAMPTZ;
        -- Copy existing data
        UPDATE organization_members SET joined_at = created_at;
    END IF;
END $$;

-- ============================================================================
-- 3. Create trigger to keep org_id and organization_id in sync
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_org_id_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Keep both columns in sync
    IF NEW.org_id IS NOT NULL THEN
        NEW.organization_id := NEW.org_id;
    ELSIF NEW.organization_id IS NOT NULL THEN
        NEW.org_id := NEW.organization_id;
    END IF;
    
    -- Keep timestamps in sync
    IF NEW.created_at IS NOT NULL THEN
        NEW.joined_at := NEW.created_at;
    ELSIF NEW.joined_at IS NOT NULL THEN
        NEW.created_at := NEW.joined_at;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_org_columns_trigger') THEN
        CREATE TRIGGER sync_org_columns_trigger
            BEFORE INSERT OR UPDATE ON organization_members
            FOR EACH ROW
            EXECUTE FUNCTION sync_org_id_columns();
    END IF;
END $$;

-- ============================================================================
-- 4. Add Foreign Keys (if not exist)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'profiles' AND column_name = 'id') THEN
        -- FK for organizations.created_by
        IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                       WHERE conname = 'organizations_created_by_fkey') THEN
            ALTER TABLE organizations 
            ADD CONSTRAINT organizations_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
        END IF;
        
        -- FK for organization_members.user_id
        IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                       WHERE conname = 'organization_members_user_id_fkey') THEN
            ALTER TABLE organization_members 
            ADD CONSTRAINT organization_members_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
    
    -- FK for organization_members.organization_id (using new column)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                   WHERE conname = 'organization_members_organization_id_fkey') THEN
        ALTER TABLE organization_members 
        ADD CONSTRAINT organization_members_organization_id_fkey 
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 5. Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================================================
-- Success!
-- ============================================================================
-- Verify with:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'organization_members'
-- ORDER BY ordinal_position;
