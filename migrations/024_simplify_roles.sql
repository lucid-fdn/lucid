-- ============================================================================
-- Simplify Roles - Match Industry Standard (Notion/Linear Pattern)
-- ============================================================================
-- Before: 6 roles (owner, admin, developer, analyst, viewer, billing)
-- After:  3 roles (owner, member, guest)
--
-- Migration strategy:
-- 1. Update CHECK constraints
-- 2. Migrate existing data
-- 3. Update RLS policies
-- ============================================================================

-- ============================================================================
-- 1. DROP OLD CHECK CONSTRAINTS FIRST
-- ============================================================================

-- Drop old constraint on org_invites (do this BEFORE updating data)
ALTER TABLE org_invites
DROP CONSTRAINT IF EXISTS org_invites_role_check;

-- ============================================================================
-- 2. MIGRATE EXISTING DATA
-- ============================================================================

-- Map old roles to new simplified roles
-- owner -> owner (no change)
-- admin -> member (members can invite, manage)
-- developer -> member (can create/edit)
-- analyst -> member (can view analytics, data)
-- viewer -> guest (view-only)
-- billing -> member (can manage billing through owner permissions)

-- Update organization_members table
UPDATE organization_members
SET role = CASE
    WHEN role = 'owner' THEN 'owner'
    WHEN role IN ('admin', 'developer', 'analyst', 'billing') THEN 'member'
    WHEN role = 'viewer' THEN 'guest'
    ELSE 'member'  -- Fallback to member for any unexpected values
END;

-- Update org_invites table
UPDATE org_invites
SET role = CASE
    WHEN role = 'owner' THEN 'owner'
    WHEN role IN ('admin', 'developer', 'analyst', 'billing') THEN 'member'
    WHEN role = 'viewer' THEN 'guest'
    ELSE 'member'  -- Fallback to member
END;

-- ============================================================================
-- 3. ADD NEW CHECK CONSTRAINTS
-- ============================================================================

-- Add new simplified constraint
ALTER TABLE org_invites
ADD CONSTRAINT org_invites_role_check
CHECK (role IN ('owner', 'member', 'guest'));

-- ============================================================================
-- 4. UPDATE RLS POLICIES
-- ============================================================================

-- Update org_invites_read policy (only owners and members can read)
DROP POLICY IF EXISTS org_invites_read ON org_invites;
CREATE POLICY org_invites_read ON org_invites
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'member')
        )
    );

-- Update org_invites_create policy (only owners and members can create)
DROP POLICY IF EXISTS org_invites_create ON org_invites;
CREATE POLICY org_invites_create ON org_invites
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'member')
        )
        AND inviter_id = auth.uid()
    );

-- Update org_invites_update policy (only owners and members can update)
DROP POLICY IF EXISTS org_invites_update ON org_invites;
CREATE POLICY org_invites_update ON org_invites
    FOR UPDATE
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'member')
        )
    );

-- ============================================================================
-- 5. UPDATE HELPER FUNCTIONS
-- ============================================================================

-- Update get_invite_details function (role field still returns correctly)
-- No changes needed - function will work with new roles

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    owner_count INT;
    member_count INT;
    guest_count INT;
BEGIN
    -- Count roles in organization_members
    SELECT COUNT(*) INTO owner_count 
    FROM organization_members WHERE role = 'owner';
    
    SELECT COUNT(*) INTO member_count 
    FROM organization_members WHERE role = 'member';
    
    SELECT COUNT(*) INTO guest_count 
    FROM organization_members WHERE role = 'guest';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ROLE SIMPLIFICATION MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'New role distribution:';
    RAISE NOTICE '  - Owners:  %', owner_count;
    RAISE NOTICE '  - Members: %', member_count;
    RAISE NOTICE '  - Guests:  %', guest_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Changes:';
    RAISE NOTICE '  - admin → member';
    RAISE NOTICE '  - developer → member';
    RAISE NOTICE '  - analyst → member';
    RAISE NOTICE '  - billing → member';
    RAISE NOTICE '  - viewer → guest';
    RAISE NOTICE '';
    RAISE NOTICE 'CHECK constraints updated for:';
    RAISE NOTICE '  - org_invites table';
    RAISE NOTICE '';
    RAISE NOTICE 'RLS policies updated for:';
    RAISE NOTICE '  - org_invites (read, create, update)';
    RAISE NOTICE '==================================================';
END $$;
