-- Migration: Fix personal workspace names to use real names instead of handles
-- Updates the trigger to use profile.name instead of profile.handle

-- ============================================================================
-- Drop old trigger
-- ============================================================================

DROP TRIGGER IF EXISTS auto_create_workspace_trigger ON profiles;
DROP FUNCTION IF EXISTS auto_create_personal_workspace();

-- ============================================================================
-- Function: Auto-create personal workspace (FIXED)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
  v_workspace_name TEXT;
BEGIN
  -- Generate unique slug
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);
  
  -- ✅ FIX: Use name if available, fallback to handle
  -- This gives us "John Doe's Workspace" instead of "user_xyz's Workspace"
  v_workspace_name := COALESCE(NEW.name, NEW.handle, 'User') || '''s Workspace';
  
  -- Create personal organization
  INSERT INTO organizations (
    slug,
    name,
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_slug,
    v_workspace_name,  -- ✅ Use the proper name
    'personal',
    NEW.id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  -- Add user as owner
  INSERT INTO organization_members (
    org_id,
    organization_id,
    user_id,
    role,
    created_at,
    joined_at
  ) VALUES (
    v_org_id,
    v_org_id,
    NEW.id,
    'owner',
    NOW(),
    NOW()
  );
  
  -- Get free plan ID
  SELECT id INTO v_plan_id 
  FROM plans 
  WHERE name = 'free' 
  LIMIT 1;
  
  -- Create free subscription (if plans table exists)
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
  END IF;
  
  RAISE NOTICE 'Auto-created personal workspace % ("%") for user %', v_org_id, v_workspace_name, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Recreate trigger
-- ============================================================================

CREATE TRIGGER auto_create_workspace_trigger
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_personal_workspace();

-- ============================================================================
-- Update existing personal workspaces to use real names
-- ============================================================================

DO $$
DECLARE
  v_record RECORD;
  v_new_name TEXT;
BEGIN
  RAISE NOTICE 'Updating existing personal workspace names...';
  
  FOR v_record IN
    SELECT 
      o.id as org_id,
      o.name as current_name,
      o.created_by,
      p.name as profile_name,
      p.handle as profile_handle
    FROM organizations o
    JOIN profiles p ON p.id = o.created_by
    WHERE o.type = 'personal'
      AND o.name LIKE '%''s Workspace'
      AND o.name NOT LIKE '%user_%''s Workspace'  -- Skip already fixed ones
  LOOP
    -- Generate proper name
    v_new_name := COALESCE(v_record.profile_name, v_record.profile_handle, 'User') || '''s Workspace';
    
    -- Only update if it's actually different
    IF v_new_name != v_record.current_name THEN
      UPDATE organizations
      SET 
        name = v_new_name,
        updated_at = NOW()
      WHERE id = v_record.org_id;
      
      RAISE NOTICE 'Updated workspace % from "%" to "%"', 
        v_record.org_id, 
        v_record.current_name, 
        v_new_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Personal workspace names updated!';
END $$;

-- ============================================================================
-- Success!
-- ============================================================================
-- ✅ Trigger now uses profile.name instead of profile.handle
-- ✅ Existing personal workspaces updated to show real names
-- ✅ New users will get "John Doe's Workspace" instead of "user_xyz's Workspace"
