-- ============================================================================
-- Fix Atomic User Creation Function - Add Missing UNIQUE Constraint
-- Industry Standard Solution for Race-Safe User Creation
-- ============================================================================

/**
 * PROBLEM: Migration 032 uses ON CONFLICT (handle) but no UNIQUE constraint exists
 * ERROR: PostgreSQL code 42P10 - "no unique or exclusion constraint matching ON CONFLICT"
 * 
 * INDUSTRY STANDARD SOLUTION:
 * 1. Add UNIQUE constraint on handle (Netflix/Airbnb/Stripe pattern)
 * 2. Use proper upsert pattern with ON CONFLICT
 * 3. Handle race conditions with SELECT FOR UPDATE
 */

-- Step 1: Add UNIQUE constraint on handle
-- This is standard - handles/usernames should always be unique
ALTER TABLE profiles 
ADD CONSTRAINT profiles_handle_unique UNIQUE (handle);

-- Step 2: Fix the atomic function to use proper constraints
CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id TEXT,
  p_handle TEXT,
  p_email TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
) 
RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Industry Standard Pattern: Check identity link FIRST with locking
  -- This prevents duplicate user creation across concurrent requests
  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id
    FOR UPDATE NOWAIT;
    
    IF FOUND THEN
      RAISE NOTICE 'User already exists: %', v_user_id;
      RETURN v_user_id;
    END IF;
    
  EXCEPTION
    WHEN lock_not_available THEN
      -- Another transaction is creating this user
      PERFORM pg_sleep(0.1);
      
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = 'privy' AND external_id = p_privy_id;
      
      IF FOUND THEN
        RAISE NOTICE 'User created by concurrent transaction: %', v_user_id;
        RETURN v_user_id;
      END IF;
  END;
  
  -- No existing user - create profile with UPSERT pattern
  -- ON CONFLICT now works because we have UNIQUE constraint
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
    SET 
      last_login_at = NOW(),
      updated_at = NOW()
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE 'Profile created/updated: %', v_user_id;
  
  -- Create identity link with conflict handling
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
  
  -- If identity link already existed (race condition edge case),
  -- get the correct user_id
  IF NOT FOUND THEN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = 'privy' AND external_id = p_privy_id;
    
    RAISE NOTICE 'Using existing identity link: %', v_user_id;
  END IF;
  
  RETURN v_user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in create_user_atomic: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Grant permissions (idempotent - safe to run multiple times)
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION create_user_atomic IS 
  'Industry standard atomic user creation with race condition protection. '
  'Uses UNIQUE constraint + ON CONFLICT for proper upsert pattern.';

-- Verify the constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_handle_unique'
  ) THEN
    RAISE EXCEPTION 'UNIQUE constraint on profiles.handle was not created!';
  END IF;
  
  RAISE NOTICE '✅ Migration 035 complete - atomic function fixed';
END $$;
