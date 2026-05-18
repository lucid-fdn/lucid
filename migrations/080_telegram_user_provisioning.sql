-- ============================================================================
-- Migration 080: Auto-provision users from Telegram bot
--
-- Creates a function that provisions a full user account from a Telegram user:
-- profile + identity_link(telegram) + personal org + project + env + free plan
-- Same flow as create_user_atomic but for Telegram (no Privy dependency).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_telegram_user(
  p_telegram_user_id TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, org_id UUID)
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
  v_handle TEXT;
  v_workspace_name TEXT;
  v_full_name TEXT;
BEGIN
  -- =========================================================================
  -- STEP 1: Check if telegram user already exists
  -- =========================================================================

  SELECT il.user_id INTO v_user_id
  FROM identity_links il
  WHERE il.provider = 'telegram' AND il.external_id = p_telegram_user_id;

  IF FOUND THEN
    -- Return existing user + their org
    SELECT om.organization_id INTO v_org_id
    FROM organization_members om
    WHERE om.user_id = v_user_id
    ORDER BY om.joined_at ASC
    LIMIT 1;

    RETURN QUERY SELECT v_user_id, v_org_id;
    RETURN;
  END IF;

  -- =========================================================================
  -- STEP 2: Generate handle from username or telegram_user_id
  -- =========================================================================

  v_handle := COALESCE(NULLIF(p_username, ''), 'tg_' || p_telegram_user_id);

  -- Ensure handle is unique (append random suffix if taken)
  WHILE EXISTS (SELECT 1 FROM profiles WHERE handle = v_handle) LOOP
    v_handle := v_handle || '_' || substr(gen_random_uuid()::text, 1, 4);
  END LOOP;

  -- =========================================================================
  -- STEP 3: Create profile
  -- =========================================================================

  v_full_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_full_name = '' THEN
    v_full_name := v_handle;
  END IF;

  INSERT INTO profiles (
    handle,
    first_name,
    last_name,
    name,
    profile_public,
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    v_handle,
    COALESCE(p_first_name, ''),
    COALESCE(p_last_name, ''),
    v_full_name,
    false,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_id;

  -- =========================================================================
  -- STEP 4: Create identity link (provider = 'telegram')
  -- =========================================================================

  INSERT INTO identity_links (
    user_id,
    provider,
    external_id,
    created_at
  )
  VALUES (
    v_user_id,
    'telegram',
    p_telegram_user_id,
    NOW()
  )
  ON CONFLICT (provider, external_id) DO NOTHING;

  -- =========================================================================
  -- STEP 5: Create personal org
  -- =========================================================================

  IF p_first_name IS NOT NULL AND p_first_name != '' THEN
    v_workspace_name := p_first_name || '''s Workspace';
  ELSE
    v_workspace_name := v_handle || '''s Workspace';
  END IF;

  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_handle,
    v_workspace_name,
    'personal',
    v_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;

  -- =========================================================================
  -- STEP 6: Add user as owner
  -- =========================================================================

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

  -- =========================================================================
  -- STEP 7: Create default project + environment
  -- =========================================================================

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

  INSERT INTO environments (
    project_id,
    name,
    is_default
  ) VALUES (
    v_project_id,
    'development',
    true
  )
  RETURNING id INTO v_env_id;

  -- =========================================================================
  -- STEP 8: Create free subscription
  -- =========================================================================

  SELECT p.id INTO v_free_plan_id
  FROM plans p
  WHERE p.name = 'starter'
  ORDER BY p.created_at DESC
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

  -- =========================================================================
  -- STEP 9: Create telegram_user_links entry
  -- =========================================================================

  INSERT INTO telegram_user_links (
    telegram_user_id,
    profile_id,
    org_id,
    telegram_username
  ) VALUES (
    p_telegram_user_id,
    v_user_id,
    v_org_id,
    p_username
  )
  ON CONFLICT (telegram_user_id) DO NOTHING;

  RETURN QUERY SELECT v_user_id, v_org_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[create_telegram_user] ERROR: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION create_telegram_user(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION create_telegram_user IS
  'Auto-provision a full user account from Telegram. '
  'Creates: profile, identity_link(telegram), personal org, project, env, free subscription, telegram_user_link. '
  'Idempotent: returns existing user if already provisioned.';

COMMIT;
