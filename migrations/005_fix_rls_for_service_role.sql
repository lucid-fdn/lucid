-- Fix RLS for Service Role - Allow JIT User Creation
-- This allows the service_role to create users automatically

-- Disable RLS on all auth-related tables for service_role operations
-- This is the MVP approach - RLS can be re-enabled later with proper policies

-- Core auth tables
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS identity_links DISABLE ROW LEVEL SECURITY;

-- Notification system
ALTER TABLE IF EXISTS notification_preferences DISABLE ROW LEVEL SECURITY;

-- Organization system (if exists)
ALTER TABLE IF EXISTS organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organization_members DISABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON TABLE profiles IS 'RLS disabled for service_role JIT user creation';
COMMENT ON TABLE identity_links IS 'RLS disabled for service_role identity linking';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'RLS disabled on auth tables for service_role. User creation should now work!';
END $$;
