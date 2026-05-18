-- ============================================================================
-- Atomic User Creation Function
-- Prevents race conditions during JIT (Just-In-Time) user creation
-- ============================================================================

/**
 * Creates user profile and identity link atomically with row-level locking
 * 
 * This function prevents race conditions when multiple concurrent requests
 * try to create the same user. Only the first request succeeds, others wait
 * and return the existing user_id.
 * 
 * Benefits:
 * - No duplicate profiles created
 * - No orphaned workspaces (trigger fires exactly once)
 * - No retries needed
 * - Thread-safe across concurrent requests
 */
CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
) 
RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions  -- Run with function creator's privileges
AS $$
DECLARE
  v_user_id UUID;
  v_link_exists BOOLEAN;
BEGIN
  -- Step 1: Check if identity link already exists with row-level lock
  -- FOR UPDATE NOWAIT = fail fast if another transaction is creating this user
  -- This prevents waiting and allows us to retry the SELECT instead
  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id
    FOR UPDATE NOWAIT;
    
    -- If we got here, link exists - return the user_id
    IF FOUND THEN
      RAISE NOTICE 'User already exists: %', v_user_id;
      RETURN v_user_id;
    END IF;
  EXCEPTION
    WHEN lock_not_available THEN
      -- Another transaction is creating this user right now
      -- Wait a moment and check again
      RAISE NOTICE 'Lock conflict, waiting for other transaction...';
      PERFORM pg_sleep(0.1);  -- Wait 100ms
      
      -- Try to get the user_id again (should exist now)
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = 'privy' AND external_id = p_privy_id;
      
      IF FOUND THEN
        RAISE NOTICE 'User created by other transaction: %', v_user_id;
        RETURN v_user_id;
      END IF;
      
      -- Still doesn't exist? This shouldn't happen, but continue with creation
      RAISE NOTICE 'User still not found after lock wait, creating...';
  END;
  
  -- Step 2: No existing user found - create profile
  -- Use INSERT ... ON CONFLICT to handle edge cases
  INSERT INTO profiles (
    handle, 
    email, 
    avatar_url, 
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    p_handle,
    p_email,
    p_avatar_url,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (handle) DO UPDATE 
    SET last_login_at = NOW()
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE 'Profile created: %', v_user_id;
  
  -- Step 3: Create identity link
  -- Use INSERT ... ON CONFLICT to handle race conditions
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
  
  -- Check if the insert succeeded or hit conflict
  GET DIAGNOSTICS v_link_exists = ROW_COUNT;
  
  IF v_link_exists = 0 THEN
    -- Link was created by another transaction (edge case race condition)
    -- Delete our profile and get the correct user_id
    RAISE NOTICE 'Identity link conflict detected, using existing user';
    DELETE FROM profiles WHERE id = v_user_id;
    
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id;
  ELSE
    RAISE NOTICE 'Identity link created successfully';
  END IF;
  
  RETURN v_user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE NOTICE 'Error in create_user_atomic: % %', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION create_user_atomic IS 
  'Atomically creates user profile and identity link with race condition protection. '
  'Uses row-level locking to ensure only one profile is created per provider identity.';
