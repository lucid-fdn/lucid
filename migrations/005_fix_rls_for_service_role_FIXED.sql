-- ============================================================================
-- Fix RLS for Service Role - Safe Version
-- ============================================================================
-- Disables RLS on tables that exist, skips tables that don't

DO $$
BEGIN
    -- Profiles table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
        COMMENT ON TABLE profiles IS 'RLS disabled for service_role JIT user creation';
        RAISE NOTICE 'RLS disabled on profiles ✓';
    END IF;
    
    -- Identity links table (may not exist yet)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'identity_links') THEN
        ALTER TABLE identity_links DISABLE ROW LEVEL SECURITY;
        COMMENT ON TABLE identity_links IS 'RLS disabled for service_role identity linking';
        RAISE NOTICE 'RLS disabled on identity_links ✓';
    END IF;
    
    -- Notification preferences
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
        ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS disabled on notification_preferences ✓';
    END IF;
    
    -- Organizations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
        ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS disabled on organizations ✓';
    END IF;
    
    -- Organization members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_members') THEN
        ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS disabled on organization_members ✓';
    END IF;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'RLS FIX COMPLETE ✓';
    RAISE NOTICE 'Tables disabled for service_role operations';
    RAISE NOTICE '==================================================';
END $$;
