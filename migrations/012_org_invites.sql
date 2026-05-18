-- ============================================================================
-- Organization Invites - Lightweight Invite-by-Link System
-- ============================================================================
-- Single-use tokens with 7-day expiry
-- Copy-link primary, optional email via Resend
-- Owner/Admin only can create/revoke
-- ============================================================================

-- Status enum
DO $$ BEGIN
    CREATE TYPE invite_status AS ENUM ('pending','accepted','revoked','expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Invites table
CREATE TABLE IF NOT EXISTS org_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT,  -- Optional (can be null for link-only invites)
    role TEXT NOT NULL CHECK (role IN ('owner','admin','developer','analyst','viewer','billing')),
    token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    inviter_id UUID NOT NULL,  -- References profiles(id) but not enforced for flexibility
    accepted_user_id UUID,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    status invite_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Email validation when provided
    CONSTRAINT email_format CHECK (email IS NULL OR position('@' in email) > 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_invites_org ON org_invites(org_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON org_invites(token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invites_browse ON org_invites(org_id, created_at DESC);

-- Prevent multiple live invites to same email in same org
CREATE UNIQUE INDEX IF NOT EXISTS org_invites_one_live_per_email
    ON org_invites(org_id, LOWER(email))
    WHERE status = 'pending' AND email IS NOT NULL;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Auto-expire invites (can be called from cron or on-demand)
CREATE OR REPLACE FUNCTION mark_expired_invites()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE org_invites
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < NOW()
    RETURNING COUNT(*) INTO expired_count;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public, extensions;

-- Get invite with organization details
CREATE OR REPLACE FUNCTION get_invite_details(p_token UUID)
RETURNS TABLE(
    invite_id UUID,
    org_id UUID,
    org_name TEXT,
    org_slug TEXT,
    role TEXT,
    status invite_status,
    expires_at TIMESTAMPTZ,
    inviter_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.org_id,
        o.name,
        o.slug,
        i.role,
        i.status,
        i.expires_at,
        p.name as inviter_name
    FROM org_invites i
    JOIN organizations o ON i.org_id = o.id
    LEFT JOIN profiles p ON i.inviter_id = p.id
    WHERE i.token = p_token;
END;
$$ LANGUAGE plpgsql STABLE
SET search_path = public, extensions;

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

-- Read: Only Owners/Admins can list invites for their org
CREATE POLICY org_invites_read ON org_invites
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

-- Insert: Only Owners/Admins can create invites
CREATE POLICY org_invites_create ON org_invites
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        AND inviter_id = auth.uid()
    );

-- Update: Only Owners/Admins can revoke invites
-- Accepting is handled via RPC function with SECURITY DEFINER
CREATE POLICY org_invites_update ON org_invites
    FOR UPDATE
    USING (
        org_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
    invite_count INT;
BEGIN
    SELECT COUNT(*) INTO invite_count FROM org_invites;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ORG INVITES MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Invites table created: %', invite_count;
    RAISE NOTICE 'Features:';
    RAISE NOTICE '  - Single-use tokens (UUID)';
    RAISE NOTICE '  - 7-day expiry';
    RAISE NOTICE '  - Optional email field';
    RAISE NOTICE '  - Role-based access (Owner/Admin only)';
    RAISE NOTICE '  - RLS policies active';
    RAISE NOTICE '==================================================';
END $$;
