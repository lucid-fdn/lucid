-- ============================================================================
-- Migration 037: Fix Profile Privacy & Workspace Display Names
-- ============================================================================
-- FIXES:
-- 1. Set profile_public DEFAULT to false (privacy-first)
-- 2. Update personal workspace names to use actual name (not handle)
-- 3. Update atomic user creation to set profile_public = false
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1: Change profile_public default to false
-- ============================================================================

ALTER TABLE profiles 
  ALTER COLUMN profile_public SET DEFAULT false;

COMMENT ON COLUMN profiles.profile_public IS 
  'Privacy setting for user profile. DEFAULT false for privacy-first approach.';

-- ============================================================================
-- FIX 2: Update existing personal workspace names to use actual names
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update personal workspaces to use "Name's Workspace" format
  -- Match any workspace that ends with "'s Workspace" but uses a handle pattern
  UPDATE organizations o
  SET name = p.first_name || '''s Workspace'
  FROM profiles p
  INNER JOIN organization_members om ON om.user_id = p.id
  WHERE o.id = om.organization_id
    AND o.type = 'personal'
    AND om.role = 'owner'
    AND p.first_name IS NOT NULL
    AND p.first_name != ''
    AND o.name LIKE '%''s Workspace' -- Match all handle-based workspace names
    AND o.name NOT LIKE p.first_name || '''s Workspace'; -- Don't update if already correct
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Updated % personal workspace names to use actual names', v_count;
END $$;

-- ============================================================================
-- FIX 3: Update create_user_atomic to use first_name and create workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_project_id UUID;
  v_env_id UUID;
  v_free_plan_id UUID;
  v_workspace_name TEXT;
  v_request_id TEXT;
BEGIN
  v_request_id := SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8);
  
  RAISE NOTICE '[ATOMIC-%] 🚀 STARTING atomic user creation', v_request_id;
  RAISE NOTICE '[ATOMIC-%] 📥 Input: user_id=%, email=%, handle=%, first_name=%', 
    v_request_id, p_user_id, p_email, p_handle, p_first_name;

  -- ============================================================================
  -- STEP 1: Create profile (with profile_public = false by default)
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 👤 Creating profile...', v_request_id;
  
  INSERT INTO profiles (
    id,
    email,
    handle,
    first_name,
    last_name,
    name,
    avatar_url,
    profile_public, -- ✅ Explicitly set to false
    onboarding_completed,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_email,
    p_handle,
    p_first_name,
    COALESCE(p_last_name, ''),
    TRIM(p_first_name || ' ' || COALESCE(p_last_name, '')),
    p_avatar_url,
    false, -- ✅ Privacy-first: profiles are private by default
    false,
    NOW(),
    NOW()
  );
  
  RAISE NOTICE '[ATOMIC-%] ✅ Profile created with profile_public = false', v_request_id;

  -- ============================================================================
  -- STEP 2: Create personal workspace using first_name
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 🏢 Creating personal workspace...', v_request_id;
  
  -- Use first_name for workspace name (not handle)
  v_workspace_name := p_first_name || '''s Workspace';
  
  RAISE NOTICE '[ATOMIC-%] 📝 Workspace name: "%"', v_request_id, v_workspace_name;
  
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
    p_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE '[ATOMIC-%] ✅ Organization created: %', v_request_id, v_org_id;

  -- ============================================================================
  -- STEP 3: Add user as owner
  -- ============================================================================
  
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    v_org_id,
    p_user_id,
    'owner',
    NOW()
  );
  
  RAISE NOTICE '[ATOMIC-%] ✅ User added as owner', v_request_id;

  -- ============================================================================
  -- STEP 4: Create default project
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
    p_user_id,
    true
  )
  RETURNING id INTO v_project_id;
  
  RAISE NOTICE '[ATOMIC-%] ✅ Project created: %', v_request_id, v_project_id;

  -- ============================================================================
  -- STEP 5: Create default environment
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
  
  RAISE NOTICE '[ATOMIC-%] ✅ Environment created: %', v_request_id, v_env_id;

  -- ============================================================================
  -- STEP 6: Create free subscription
  -- ============================================================================
  
  SELECT id INTO v_free_plan_id
  FROM plans
  WHERE name = 'free'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free plan not found';
  END IF;
  
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
  
  RAISE NOTICE '[ATOMIC-%] ✅ Free subscription created', v_request_id;
  RAISE NOTICE '[ATOMIC-%] 🎊 ATOMIC CREATION COMPLETE', v_request_id;

  -- ============================================================================
  -- Return workspace details
  -- ============================================================================
  
  RETURN QUERY
  SELECT 
    p_user_id,
    v_org_id,
    p_handle,
    v_workspace_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON FUNCTION create_user_atomically IS
  'Atomically creates user profile + personal workspace + free subscription.
  PRIVACY: Sets profile_public = false by default.
  NAMES: Uses first_name for workspace name (not handle).';

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_default_value TEXT;
  v_public_count INTEGER;
  v_private_count INTEGER;
BEGIN
  -- Check default value
  SELECT column_default INTO v_default_value
  FROM information_schema.columns
  WHERE table_name = 'profiles'
    AND column_name = 'profile_public';
  
  RAISE NOTICE '✅ profile_public default: %', v_default_value;
  
  -- Count public vs private profiles
  SELECT 
    COUNT(*) FILTER (WHERE profile_public = true),
    COUNT(*) FILTER (WHERE profile_public = false OR profile_public IS NULL)
  INTO v_public_count, v_private_count
  FROM profiles;
  
  RAISE NOTICE '📊 Profiles: % public, % private', v_public_count, v_private_count;
END $$;
