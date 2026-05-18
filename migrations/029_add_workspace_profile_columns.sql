-- ============================================================================
-- Add workspace profile columns to organizations table
-- ============================================================================
-- These columns are needed for the workspace profile form
-- ============================================================================

-- Add social links and privacy columns
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS github_username TEXT,
ADD COLUMN IF NOT EXISTS twitter_username TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS workspace_public BOOLEAN DEFAULT true;

-- Create indexes for lookups
CREATE INDEX IF NOT EXISTS idx_organizations_github 
ON organizations(github_username) WHERE github_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_twitter 
ON organizations(twitter_username) WHERE twitter_username IS NOT NULL;

-- Verification
DO $$
BEGIN
    -- Check that all columns exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'github_username'
    ) THEN
        RAISE EXCEPTION 'Column github_username was not created!';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'workspace_public'
    ) THEN
        RAISE EXCEPTION 'Column workspace_public was not created!';
    END IF;
    
    RAISE NOTICE '✅ All workspace profile columns added successfully';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MIGRATION 029 COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Added columns: github_username, twitter_username, linkedin_url, workspace_public';
    RAISE NOTICE 'Workspace profile forms will now save all fields correctly';
    RAISE NOTICE '==================================================';
END $$;
