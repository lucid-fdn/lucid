-- ============================================================================
-- Migration 038: Fix create_user_atomic to Accept and Use first_name/last_name
-- ============================================================================
-- Updates the JIT user creation function to:
-- 1. Accept first_name and last_name parameters
-- 2. Store them in profiles table  
-- 3. Use first_name for personal workspace name (not handle)
-- 4. Set profile_public = false by default
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
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
  v_full_name TEXT;
BEGIN
  -- ============================================================================
  -- STEP 1: Check if user already exists (race condition protection)
  -- ============================================================================
  
  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id
    FOR UPDATE NOWAIT;
    
    IF FOUND THEN
      RAISE NOTICE '[create_user_atomic] User already exists: %', v_user_id;
      RETURN v_user_id;
    END IF;
    
  EXCEPTION
    WHEN lock_not_available THEN
      -- Another transaction is creating this user - wait and retry
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
  -- STEP 2: Create profile with first_name, last_name, and profile_public=false
  -- ============================================================================
  
  -- Build full name from first + last
  v_full_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_full_name = '' THEN
    v_full_name := p_handle; -- Fallback to handle if no name provided
  END IF;
  
  INSERT INTO profiles (
    handle, 
    email,
    first_name,
    last_name,
    name,
    avatar_url,
    profile_public, -- ✅ Explicitly set to false
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    p_handle,
    p_email,
    COALESCE(p_first_name, ''),
    COALESCE(p_last_name, ''),
    v_full_name,
    p_avatar_url,
    false, -- ✅ Privacy-first: profiles are private by default
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (handle) DO UPDATE 
    SET 
      last_login_at = NOW(),
      updated_at = NOW()
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE '[create_user_atomic] Profile created: % (name: %)', v_user_id, v_full_name;
  
  -- ============================================================================
  -- STEP 3: Create identity link
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
  
  RAISE NOTICE '[create_user_atomic] Identity link created for Privy ID: %', p_privy_id;
  
  -- ============================================================================
  -- STEP 4: Create personal workspace using first_name (NOT handle)
  -- ============================================================================
  
  -- Use first_name if available, otherwise use full name or handle
  IF p_first_name IS NOT NULL AND p_first_name != '' THEN
    v_workspace_name := p_first_name || '''s Workspace';
  ELSIF v_full_name != '' AND v_full_name != p_handle THEN
    v_workspace_name := v_full_name || '''s Workspace';
  ELSE
    v_workspace_name := p_handle || '''s Workspace';
  END IF;
  
  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_handle, -- Slug uses handle for URL
    v_workspace_name, -- ✅ Name uses first_name
    'personal',
    v_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE '[create_user_atomic] Personal workspace created: % (name: %)', v_org_id, v_workspace_name;
  
  -- ============================================================================
  -- STEP 5: Add user as owner
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
  -- STEP 6: Create default project
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
  -- STEP 7: Create default environment
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
  -- STEP 8: Create free subscription
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
    
    RAISE NOTICE '[create_user_atomic] Free subscription created';
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
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION create_user_atomic IS 
  'JIT user creation with personal workspace. '
  'PRIVACY: Sets profile_public = false by default. '
  'NAMES: Uses first_name for workspace name (not handle). '
  'Parameters: privy_id, handle, email, avatar_url, first_name, last_name';

COMMIT;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 038 complete';
  RAISE NOTICE '📝 create_user_atomic now accepts first_name and last_name';
  RAISE NOTICE '🏢 Personal workspaces will use actual names, not handles';
  RAISE NOTICE '🔒 Profiles default to private (profile_public = false)';
END $$;
