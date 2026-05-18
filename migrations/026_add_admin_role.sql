-- ============================================================================
-- Add Admin Role - Extend simplified role system
-- ============================================================================
-- Current: 3 roles (owner, member, guest)
-- Adding: admin (between owner and member)
-- Pattern: Notion/Linear/GitHub style
-- ============================================================================

-- ============================================================================
-- 1. UPDATE CHECK CONSTRAINTS TO INCLUDE ADMIN
-- ============================================================================

-- Update organization_members constraint (no explicit constraint, uses TEXT)
-- No action needed - TEXT field accepts any value

-- Update org_invites constraint
ALTER TABLE org_invites
DROP CONSTRAINT IF EXISTS org_invites_role_check;

ALTER TABLE org_invites
ADD CONSTRAINT org_invites_role_check
CHECK (role IN ('owner', 'admin', 'member', 'guest'));

-- ============================================================================
-- 2. UPDATE RLS POLICIES TO INCLUDE ADMIN
-- ============================================================================

-- Update org_invites_read policy (owners, admins, and members can read)
DROP POLICY IF EXISTS org_invites_read ON org_invites;
CREATE POLICY org_invites_read ON org_invites
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
    );

-- Update org_invites_create policy (owners, admins, and members can create)
DROP POLICY IF EXISTS org_invites_create ON org_invites;
CREATE POLICY org_invites_create ON org_invites
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        AND inviter_id = auth.uid()
    );

-- Update org_invites_update policy (owners, admins, and members can update)
DROP POLICY IF EXISTS org_invites_update ON org_invites;
CREATE POLICY org_invites_update ON org_invites
    FOR UPDATE
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
    );

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ADMIN ROLE ADDITION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Available roles:';
    RAISE NOTICE '  - owner:  Full control + billing';
    RAISE NOTICE '  - admin:  Full access except billing/delete workspace';
    RAISE NOTICE '  - member: Can create/edit + invite others';
    RAISE NOTICE '  - guest:  View-only access';
    RAISE NOTICE '';
    RAISE NOTICE 'Updated:';
    RAISE NOTICE '  - org_invites CHECK constraint';
    RAISE NOTICE '  - org_invites RLS policies';
    RAISE NOTICE '==================================================';
END $$;
