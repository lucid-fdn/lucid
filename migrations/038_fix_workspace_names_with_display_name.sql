-- ============================================================================
-- Migration 038: Fix Personal Workspace Names Using Display Name
-- ============================================================================
-- Simpler approach: Just use display_name instead of first_name/last_name
-- Updates create_user_atomic to:
-- 1. Accept p_display_name parameter
-- 2. Use it for both profile.name and workspace name
-- 3. Set profile_public = false by default
-- ============================================================================

BEGIN;

-- Drop all existing versions of the function first
DROP FUNCTION IF EXISTS create_user_atomic(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_user_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;

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
  -- STEP 2: Use display_name for profile
  -- ============================================================================
  
  v_display_name := COALESCE(p_display_name, p_handle);
  
  INSERT INTO profiles (
    handle, 
    email,
    name,              -- Just use display_name
    avatar_url,
    profile_public,    -- ✅ Explicitly set to false
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    p_handle,
    p_email,
    v_display_name,
    p_avatar_url,
    false,            -- ✅ Privacy-first: profiles are private by default
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
  
  -- ============================================================================
  -- STEP 4: Create personal workspace using FIRST WORD of display name
  -- ============================================================================
  
  -- Extract first word from display name for workspace name
  -- "John Doe" -> "John's Workspace"
  -- "john@example.com" -> "john's Workspace" 
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
    v_workspace_name,  -- ✅ "John's Workspace" not "user_xyz's Workspace"
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
  'JIT user creation with personal workspace. '
  'PRIVACY: Sets profile_public = false by default. '
  'NAMES: Extracts first word from display_name for workspace (e.g., "John Doe" -> "John''s Workspace"). '
  'Parameters: privy_id, handle, email, avatar_url, display_name';

COMMIT;

-- ============================================================================
-- Also update existing personal workspaces
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER := 0;
  v_first_word TEXT;
  v_rec RECORD;
BEGIN
  -- Update all personal workspaces that end with 's Workspace but don't match the actual name
  FOR v_rec IN (
    SELECT 
      o.id as org_id,
      o.name as current_name,
      p.name as display_name,
      split_part(p.name, ' ', 1) as first_word
    FROM organizations o
    INNER JOIN organization_members om ON om.organization_id = o.id
    INNER JOIN profiles p ON p.id = om.user_id
    WHERE o.type = 'personal'
      AND om.role = 'owner'
      AND o.name LIKE '%''s Workspace'
      AND p.name IS NOT NULL
      AND p.name != ''
  )
  LOOP
    -- Extract first word for workspace name
    v_first_word := v_rec.first_word;
    IF v_first_word = '' THEN
      v_first_word := v_rec.display_name;
    END IF;
    
    -- Update if different
    IF v_rec.current_name != v_first_word || '''s Workspace' THEN
      UPDATE organizations
      SET 
        name = v_first_word || '''s Workspace',
        updated_at = NOW()
      WHERE id = v_rec.org_id;
      
      v_count := v_count + 1;
      RAISE NOTICE 'Updated workspace: % -> %', v_rec.current_name, v_first_word || '''s Workspace';
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Updated % personal workspace names', COALESCE(v_count, 0);
END $$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 038 complete';
  RAISE NOTICE '📝 create_user_atomic now accepts display_name parameter';
  RAISE NOTICE '🏢 Personal workspaces use first word of display name';
  RAISE NOTICE '🔒 Profiles default to private (profile_public = false)';
  RAISE NOTICE '📊 Existing workspaces updated to match';
END $$;
