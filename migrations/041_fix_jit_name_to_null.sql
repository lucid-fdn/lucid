-- ============================================================================
-- Migration 041: Fix JIT to NOT set name to handle
-- ============================================================================
-- Problem: create_user_atomic falls back to handle if display_name is NULL
--          This creates profiles with name = "user_66c6cghb"
-- Solution: Set name to NULL if no display_name provided
--          User MUST provide name during onboarding
-- ============================================================================

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL
) 
RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_existing_workspace_id UUID;
BEGIN
  -- ============================================================================
  -- STEP 1: Check if identity_link exists (normal case)
  -- ============================================================================
  
  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id
    FOR UPDATE NOWAIT;
    
    IF FOUND THEN
      RAISE NOTICE '[create_user_atomic] ✅ User already exists with identity_link: %', v_user_id;
      RETURN v_user_id;
    END IF;
    
  EXCEPTION
    WHEN lock_not_available THEN
      PERFORM pg_sleep(0.1);
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = 'privy' AND external_id = p_privy_id;
      
      IF FOUND THEN
        RAISE NOTICE '[create_user_atomic] ✅ User created by concurrent transaction: %', v_user_id;
        RETURN v_user_id;
      END IF;
  END;
  
  -- ============================================================================
  -- STEP 2: Check for ORPHANED USER by handle
  -- ============================================================================
  
  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE p.handle = p_handle
  LIMIT 1;
  
  IF FOUND THEN
    RAISE NOTICE '[create_user_atomic] 🔧 ORPHANED USER (by handle) - Creating identity_link for: %', v_user_id;
    
    INSERT INTO identity_links (user_id, provider, external_id, created_at)
    VALUES (v_user_id, 'privy', p_privy_id, NOW())
    ON CONFLICT (provider, external_id) DO NOTHING;
    
    RAISE NOTICE '[create_user_atomic] ✅ FIXED - User %', v_user_id;
    RETURN v_user_id;
  END IF;
  
  -- ============================================================================
  -- STEP 3: Create profile
  -- ============================================================================
  -- ✅ FIX: Do NOT fall back to handle if p_display_name is NULL
  --         Leave name as NULL - user MUST provide during onboarding
  
  INSERT INTO profiles (
    handle, 
    email,
    name, 
    avatar_url,
    profile_public,
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    p_handle,
    p_email,
    p_display_name,  -- ✅ NULL if not provided (not p_handle!)
    p_avatar_url,
    false,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (handle) DO UPDATE 
    SET 
      last_login_at = NOW(),
      updated_at = NOW()
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE '[create_user_atomic] Profile created/updated: % (name: %)', v_user_id, COALESCE(p_display_name, 'NULL - will be set during onboarding');
  
  -- ============================================================================
  -- STEP 4: Create identity link
  -- ============================================================================
  
  INSERT INTO identity_links (user_id, provider, external_id, created_at)
  VALUES (v_user_id, 'privy', p_privy_id, NOW())
  ON CONFLICT (provider, external_id) DO NOTHING;
  
  -- ============================================================================
  -- STEP 5: CHECK if user already has a workspace (ORPHANED USER CASE)
  -- ============================================================================
  
  SELECT o.id INTO v_existing_workspace_id
  FROM organizations o
  INNER JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = v_user_id
    AND o.type = 'personal'
  LIMIT 1;
  
  IF FOUND THEN
    RAISE NOTICE '[create_user_atomic] 🔧 ORPHANED USER DETECTED - User % already has workspace %', v_user_id, v_existing_workspace_id;
    RAISE NOTICE '[create_user_atomic] ✅ FIXED - Returning existing user';
    RETURN v_user_id;
  END IF;
  
  -- ============================================================================
  -- STEP 6: DON'T create workspace - let onboarding do it
  -- ============================================================================
  -- User will provide their display name during onboarding
  -- Then workspace will be created with the correct name
  
  RAISE NOTICE '[create_user_atomic] ✅ COMPLETE - User created (workspace will be created during onboarding): %', v_user_id;
  
  RETURN v_user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[create_user_atomic] ❌ ERROR: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION create_user_atomic IS 
  'JIT user creation WITHOUT fallback to handle for name. '
  'Sets name to NULL if not provided - user MUST set during onboarding. '
  'This prevents "user_xxxxx''s Workspace" names. '
  'PRIVACY: Sets profile_public = false by default.';

COMMIT;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 041 complete';
  RAISE NOTICE '🔧 Profile name NO LONGER falls back to handle';
  RAISE NOTICE '📝 Name is NULL until user provides it in onboarding';
  RAISE NOTICE '✅ Personal workspace will use actual name: "John Doe''s Workspace"';
END $$;
