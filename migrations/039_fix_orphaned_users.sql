-- ============================================================================
-- Migration 039: Fix Orphaned Users (Users without identity_links)
-- ============================================================================
-- Problem: Users can exist with personal workspaces but no identity_link
-- Solution: Update create_user_atomic to detect and fix orphaned users
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
  v_org_id UUID;
  v_project_id UUID;
  v_env_id UUID;
  v_free_plan_id UUID;
  v_workspace_name TEXT;
  v_display_name TEXT;
  v_first_word TEXT;
  v_existing_workspace_count INTEGER;
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
      RAISE NOTICE '[create_user_atomic] User already exists with identity_link: %', v_user_id;
      RETURN v_user_id;
    END IF;
    
  EXCEPTION
    WHEN lock_not_available THEN
      PERFORM pg_sleep(0.1);
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = 'privy' AND external_id = p_privy_id;
      
      IF FOUND THEN
        RAISE NOTICE '[create_user_atomic] User created by concurrent transaction: %', v_user_id;
        RETURN v_user_id;
      END IF;
  END;
  
  -- ============================================================================
  -- STEP 2: Check for ORPHANED USER (profile exists, no identity_link)
  -- ============================================================================
  -- This happens when identity_link was deleted or never created
  
  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE p.handle = p_handle
  LIMIT 1;
  
  IF FOUND THEN
    RAISE NOTICE '[create_user_atomic] 🔧 ORPHANED USER DETECTED - Profile exists without identity_link: %', v_user_id;
    
    -- Create the missing identity_link
    INSERT INTO identity_links (
      user_id,
      provider,
      external_id,
      created_at
    )
    VALUES (
      v_user_id,
      'privy',
      p_privy_id,
      NOW()
    )
    ON CONFLICT (provider, external_id) DO NOTHING;
    
    RAISE NOTICE '[create_user_atomic] ✅ FIXED - Created missing identity_link for user %', v_user_id;
    RETURN v_user_id;
  END IF;
  
  -- ============================================================================
  -- STEP 3: Create new user (normal JIT flow)
  -- ============================================================================
  
  v_display_name := COALESCE(p_display_name, p_handle);
  
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
    v_display_name,
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
  
  RAISE NOTICE '[create_user_atomic] Profile created: % (name: %)', v_user_id, v_display_name;
  
  -- ============================================================================
  -- STEP 4: Create identity link
  -- ============================================================================
  
  INSERT INTO identity_links (
    user_id,
    provider,
    external_id,
    created_at
  )
  VALUES (
    v_user_id,
    'privy',
    p_privy_id,
    NOW()
  )
  ON CONFLICT (provider, external_id) DO NOTHING;
  
  -- ============================================================================
  -- STEP 5: Create personal workspace using FIRST WORD of display name
  -- ============================================================================
  
  -- Extract first word from display name for workspace name
  v_first_word := split_part(v_display_name, ' ', 1);
  IF v_first_word = '' THEN
    v_first_word := v_display_name;
  END IF;
  
  v_workspace_name := v_first_word || '''s Workspace';
  
  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_handle,
    v_workspace_name,
    'personal',
    v_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE '[create_user_atomic] Personal workspace created: % (name: %)', v_org_id, v_workspace_name;
  
  -- ============================================================================
  -- STEP 6: Add user as owner
  -- ============================================================================
  
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner',
    NOW()
  );
  
  -- ============================================================================
  -- STEP 7: Create default project
  -- ============================================================================
  
  INSERT INTO projects (
    org_id,
    name,
    slug,
    created_by,
    is_default
  ) VALUES (
    v_org_id,
    'Default',
    'default',
    v_user_id,
    true
  )
  RETURNING id INTO v_project_id;
  
  -- ============================================================================
  -- STEP 8: Create default environment
  -- ============================================================================
  
  INSERT INTO environments (
    project_id,
    name,
    is_default
  ) VALUES (
    v_project_id,
    'Development',
    true
  )
  RETURNING id INTO v_env_id;
  
  -- ============================================================================
  -- STEP 9: Create free subscription
  -- ============================================================================
  
  SELECT id INTO v_free_plan_id
  FROM plans
  WHERE name = 'free'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO subscriptions (
      org_id,
      plan_id,
      status,
      billing_period,
      payment_method,
      current_period_start,
      current_period_end
    ) VALUES (
      v_org_id,
      v_free_plan_id,
      'active',
      'monthly',
      'stripe_card',
      NOW(),
      NOW() + INTERVAL '1 year'
    );
  END IF;
  
  RAISE NOTICE '[create_user_atomic] ✅ COMPLETE - User ID: %', v_user_id;
  
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
  'JIT user creation with orphaned user detection. '
  'HANDLES: Users who exist but have missing identity_links. '
  'PRIVACY: Sets profile_public = false by default. '
  'NAMES: Extracts first word from display_name for workspace.';

COMMIT;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 039 complete';
  RAISE NOTICE '🔧 create_user_atomic now detects and fixes orphaned users';
  RAISE NOTICE '📝 Orphaned users = profiles that exist without identity_links';
  RAISE NOTICE '🔗 Missing identity_links are automatically created';
END $$;
