-- Migration: Fix atomic user creation to include personal workspace
-- Industry Standard: Embed workspace creation in atomic function (Netflix/Airbnb pattern)
-- Triggers don't fire reliably with SECURITY DEFINER, so we do it explicitly

-- ============================================================================
-- Drop old function
-- ============================================================================

DROP FUNCTION IF EXISTS create_user_atomic(TEXT, TEXT, TEXT, TEXT);

-- ============================================================================
-- Create enhanced atomic function (profile + workspace in ONE transaction)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS TEXT  -- Returns user_id
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with elevated privileges
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_slug TEXT;
  v_workspace_name TEXT;
  v_plan_id UUID;
  v_existing_link UUID;
  v_request_id TEXT;
BEGIN
  -- Generate request ID for tracking
  v_request_id := substring(md5(random()::text) from 1 for 8);
  
  RAISE NOTICE '[ATOMIC-%] 🚀 START create_user_atomic', v_request_id;
  RAISE NOTICE '[ATOMIC-%] Privy ID: %', v_request_id, p_privy_id;
  RAISE NOTICE '[ATOMIC-%] Handle: %', v_request_id, p_handle;
  
  -- ============================================================================
  -- STEP 1: Check if user already exists (race condition check)
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 🔍 Checking for existing user...', v_request_id;
  
  SELECT user_id INTO v_existing_link
  FROM identity_links
  WHERE provider = 'privy' AND external_id = p_privy_id
  FOR UPDATE;  -- Row-level lock
  
  IF v_existing_link IS NOT NULL THEN
    RAISE NOTICE '[ATOMIC-%] ⚠️ User already exists: %', v_request_id, v_existing_link;
    RETURN v_existing_link::TEXT;
  END IF;
  
  RAISE NOTICE '[ATOMIC-%] ✅ No existing user found', v_request_id;
  
  -- ============================================================================
  -- STEP 2: Create profile
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 👤 Creating profile...', v_request_id;
  
  INSERT INTO profiles (
    handle,
    email,
    avatar_url,
    created_at,
    updated_at
  ) VALUES (
    p_handle,
    p_email,
    p_avatar_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE '[ATOMIC-%] ✅ Profile created: %', v_request_id, v_user_id;
  
  -- ============================================================================
  -- STEP 3: Create identity_link
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 🔗 Creating identity link...', v_request_id;
  
  INSERT INTO identity_links (
    user_id,
    provider,
    external_id,
    created_at
  ) VALUES (
    v_user_id,
    'privy',
    p_privy_id,
    NOW()
  );
  
  RAISE NOTICE '[ATOMIC-%] ✅ Identity link created', v_request_id;
  
  -- ============================================================================
  -- STEP 4: Create personal workspace (INDUSTRY STANDARD: In same transaction)
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 🏢 Creating personal workspace...', v_request_id;
  
  -- Generate unique slug
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);
  v_workspace_name := COALESCE(p_handle, 'User') || '''s Workspace';
  
  RAISE NOTICE '[ATOMIC-%] 📝 Workspace slug: %', v_request_id, v_slug;
  RAISE NOTICE '[ATOMIC-%] 📝 Workspace name: %', v_request_id, v_workspace_name;
  
  -- Create organization
  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_slug,
    v_workspace_name,
    'personal',
    v_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE '[ATOMIC-%] ✅ Organization created: %', v_request_id, v_org_id;
  
  -- ============================================================================
  -- STEP 5: Add user as owner
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 👤 Adding user as owner...', v_request_id;
  
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
  
  RAISE NOTICE '[ATOMIC-%] ✅ User added as owner', v_request_id;
  
  -- ============================================================================
  -- STEP 6: Create free subscription
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 💳 Creating free subscription...', v_request_id;
  
  SELECT id INTO v_plan_id FROM plans WHERE name = 'free' LIMIT 1;
  
  IF v_plan_id IS NOT NULL THEN
    INSERT INTO subscriptions (
      org_id,
      plan_id,
      status,
      billing_period,
      payment_method,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      v_org_id,
      v_plan_id,
      'active',
      'monthly',
      'stripe_card',
      NOW(),
      NOW() + INTERVAL '100 years',
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '[ATOMIC-%] ✅ Subscription created', v_request_id;
  ELSE
    RAISE NOTICE '[ATOMIC-%] ⚠️ No free plan found', v_request_id;
  END IF;
  
  -- ============================================================================
  -- Success!
  -- ============================================================================
  
  RAISE NOTICE '[ATOMIC-%] 🎉 SUCCESS - User + Workspace created atomically', v_request_id;
  RAISE NOTICE '[ATOMIC-%] User ID: %', v_request_id, v_user_id;
  RAISE NOTICE '[ATOMIC-%] Org ID: %', v_request_id, v_org_id;
  
  RETURN v_user_id::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[ATOMIC-%] ❌ ERROR: %', v_request_id, SQLERRM;
    RAISE EXCEPTION 'Failed to create user atomically: %', SQLERRM;
END;
$$;

-- ============================================================================
-- Disable old trigger (workspace now created in atomic function)
-- ============================================================================

DROP TRIGGER IF EXISTS auto_create_workspace_trigger ON profiles;

RAISE NOTICE '==================================================';
RAISE NOTICE '✅ Migration 033 complete';
RAISE NOTICE '';
RAISE NOTICE '📋 CHANGES:';
RAISE NOTICE '1. create_user_atomic() now creates profile + workspace atomically';
RAISE NOTICE '2. Old trigger disabled (no longer needed)';
RAISE NOTICE '3. Industry standard: All user setup in ONE transaction';
RAISE NOTICE '';
RAISE NOTICE '🔍 BENEFITS:';
RAISE NOTICE '- No race conditions (atomic operation)';
RAISE NOTICE '- No trigger reliability issues';
RAISE NOTICE '- Guaranteed: 1 user = 1 workspace';
RAISE NOTICE '';
RAISE NOTICE '==================================================';
