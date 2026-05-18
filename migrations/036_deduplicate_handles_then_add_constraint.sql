-- ============================================================================
-- Fix Duplicate Handles BEFORE Adding UNIQUE Constraint
-- Industry Standard: Clean Data First, Then Enforce Constraints
-- ============================================================================

/**
 * PROBLEM: Migration 035 failed because duplicate handles exist
 * ERROR: 23505 - Key (handle)=(user_oxozgest) is duplicated
 * 
 * INDUSTRY STANDARD SOLUTION:
 * Step 1: Find and fix duplicate handles (make them unique)
 * Step 2: Add UNIQUE constraint (will now succeed)
 * Step 3: Update atomic function to use the constraint
 * 
 * PATTERN: Stripe/Auth0 - Always clean data before adding constraints
 */

-- ============================================================================
-- STEP 1: Find and Report Duplicate Handles
-- ============================================================================

DO $$
DECLARE
  v_duplicate_count INTEGER;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT handle, COUNT(*) as count
    FROM profiles
    GROUP BY handle
    HAVING COUNT(*) > 1
  ) duplicates;
  
  RAISE NOTICE 'Found % duplicate handles', v_duplicate_count;
  
  -- Log details of duplicates for debugging
  FOR r IN (
    SELECT handle, COUNT(*) as count, 
           array_agg(id::TEXT ORDER BY created_at) as user_ids,
           array_agg(created_at::TEXT ORDER BY created_at) as created_dates
    FROM profiles
    GROUP BY handle
    HAVING COUNT(*) > 1
  ) LOOP
    RAISE NOTICE 'Duplicate handle: % (count: %, users: %, dates: %)', 
      r.handle, r.count, r.user_ids, r.created_dates;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 2: Fix Duplicates - Keep Oldest, Rename Newer Ones
-- ============================================================================

DO $$
DECLARE
  v_row RECORD;
  v_row_num INTEGER;
  v_new_handle TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  -- For each duplicate handle group
  FOR v_row IN (
    SELECT handle, 
           id,
           created_at,
           ROW_NUMBER() OVER (PARTITION BY handle ORDER BY created_at ASC) as rn
    FROM profiles
    WHERE handle IN (
      SELECT handle 
      FROM profiles 
      GROUP BY handle 
      HAVING COUNT(*) > 1
    )
  ) LOOP
    -- Keep the first (oldest) one, rename the rest
    IF v_row.rn > 1 THEN
      -- Generate unique handle by appending timestamp
      v_new_handle := v_row.handle || '_' || EXTRACT(EPOCH FROM v_row.created_at)::BIGINT;
      
      -- Update the duplicate
      UPDATE profiles 
      SET 
        handle = v_new_handle,
        updated_at = NOW()
      WHERE id = v_row.id;
      
      v_updated_count := v_updated_count + 1;
      
      RAISE NOTICE 'Renamed duplicate: % → % (user_id: %)', 
        v_row.handle, v_new_handle, v_row.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Fixed % duplicate handles', v_updated_count;
END $$;

-- ============================================================================
-- STEP 3: Verify No Duplicates Remain
-- ============================================================================

DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT handle, COUNT(*) as count
    FROM profiles
    GROUP BY handle
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate handles after deduplication!', v_duplicate_count;
  END IF;
  
  RAISE NOTICE '✅ Verified: No duplicate handles remain';
END $$;

-- ============================================================================
-- STEP 4: Now Add UNIQUE Constraint (Will Succeed)
-- ============================================================================

DO $$
BEGIN
  -- Drop constraint if it somehow exists (idempotent)
  ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_handle_unique;

  -- Add the UNIQUE constraint
  ALTER TABLE profiles 
  ADD CONSTRAINT profiles_handle_unique UNIQUE (handle);

  RAISE NOTICE '✅ UNIQUE constraint added on profiles.handle';
END $$;

-- ============================================================================
-- STEP 5: Update Atomic Function to Use Constraint
-- ============================================================================

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
  -- Industry Standard: Check identity link FIRST with row-level locking
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
      -- Another transaction is creating this user - wait and retry
      PERFORM pg_sleep(0.1);
      
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = 'privy' AND external_id = p_privy_id;
      
      IF FOUND THEN
        RAISE NOTICE 'User created by concurrent transaction: %', v_user_id;
        RETURN v_user_id;
      END IF;
  END;
  
  -- No existing user - create with UPSERT (now works with UNIQUE constraint)
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
  
  RETURN v_user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in create_user_atomic: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION create_user_atomic IS 
  'Industry standard atomic user creation with race condition protection. '
  'Uses UNIQUE constraint + ON CONFLICT for proper upsert pattern.';

-- ============================================================================
-- STEP 6: Final Verification
-- ============================================================================

DO $$
BEGIN
  -- Check constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_handle_unique'
  ) THEN
    RAISE EXCEPTION 'UNIQUE constraint was not created!';
  END IF;
  
  -- Check no duplicates
  IF EXISTS (
    SELECT 1 FROM profiles 
    GROUP BY handle 
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate handles still exist!';
  END IF;
  
  RAISE NOTICE '✅ Migration 036 complete - handles deduplicated and constraint added';
END $$;
