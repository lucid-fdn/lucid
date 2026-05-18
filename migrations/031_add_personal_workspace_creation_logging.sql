-- Migration: Add comprehensive logging to personal workspace creation
-- Tracks duplicate creation attempts and helps debug why workspaces created 4x

-- ============================================================================
-- Drop and recreate function with extensive logging
-- ============================================================================

DROP TRIGGER IF EXISTS auto_create_workspace_trigger ON profiles;
DROP FUNCTION IF EXISTS auto_create_personal_workspace();

CREATE OR REPLACE FUNCTION auto_create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
  v_workspace_name TEXT;
  v_existing_workspace UUID;
  v_existing_count INTEGER;
BEGIN
  -- ============================================================================
  -- COMPREHENSIVE LOGGING START
  -- ============================================================================
  
  RAISE NOTICE '==================================================';
  RAISE NOTICE '[WORKSPACE-CREATE] 🚀 TRIGGER FIRED';
  RAISE NOTICE '[WORKSPACE-CREATE] User ID: %', NEW.id;
  RAISE NOTICE '[WORKSPACE-CREATE] User Handle: %', NEW.handle;
  RAISE NOTICE '[WORKSPACE-CREATE] User Name: %', NEW.name;
  RAISE NOTICE '[WORKSPACE-CREATE] Timestamp: %', NOW();
  RAISE NOTICE '==================================================';
  
  -- ============================================================================
  -- Check if user already has a personal workspace
  -- ============================================================================
  
  RAISE NOTICE '[WORKSPACE-CREATE] 🔍 Checking for existing personal workspace...';
  
  SELECT om.organization_id INTO v_existing_workspace
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = NEW.id
    AND o.type = 'personal'
    AND om.role = 'owner'
  LIMIT 1;
  
  -- Count total personal workspaces (should be 0 or 1)
  SELECT COUNT(*) INTO v_existing_count
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = NEW.id
    AND o.type = 'personal'
    AND om.role = 'owner';
  
  RAISE NOTICE '[WORKSPACE-CREATE] 📊 Existing personal workspaces found: %', v_existing_count;
  
  IF v_existing_workspace IS NOT NULL THEN
    RAISE NOTICE '[WORKSPACE-CREATE] ⚠️ SKIPPING - User % already has personal workspace %', 
      NEW.id, v_existing_workspace;
    RAISE NOTICE '[WORKSPACE-CREATE] ✅ Function returning without creating workspace';
    RAISE NOTICE '==================================================';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE '[WORKSPACE-CREATE] ✅ No existing workspace found - proceeding with creation';
  
  -- ============================================================================
  -- Generate workspace details
  -- ============================================================================
  
  -- Generate unique slug
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);
  
  -- Use name if available, fallback to handle
  v_workspace_name := COALESCE(NEW.name, NEW.handle, 'User') || '''s Workspace';
  
  RAISE NOTICE '[WORKSPACE-CREATE] 📝 Generated slug: %', v_slug;
  RAISE NOTICE '[WORKSPACE-CREATE] 📝 Generated name: %', v_workspace_name;
  
  -- ============================================================================
  -- Create personal organization
  -- ============================================================================
  
  RAISE NOTICE '[WORKSPACE-CREATE] 🏢 Creating organization...';
  
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
    NEW.id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE '[WORKSPACE-CREATE] ✅ Organization created with ID: %', v_org_id;
  
  -- ============================================================================
  -- Add user as owner
  -- ============================================================================
  
  RAISE NOTICE '[WORKSPACE-CREATE] 👤 Adding user as owner...';
  
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
  
  RAISE NOTICE '[WORKSPACE-CREATE] ✅ User added as owner';
  
  -- ============================================================================
  -- Create free subscription
  -- ============================================================================
  
  RAISE NOTICE '[WORKSPACE-CREATE] 💳 Looking up free plan...';
  
  -- Get free plan ID
  SELECT id INTO v_plan_id 
  FROM plans 
  WHERE name = 'free' 
  LIMIT 1;
  
  IF v_plan_id IS NOT NULL THEN
    RAISE NOTICE '[WORKSPACE-CREATE] ✅ Free plan found: %', v_plan_id;
    RAISE NOTICE '[WORKSPACE-CREATE] 💳 Creating subscription...';
    
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
    
    RAISE NOTICE '[WORKSPACE-CREATE] ✅ Subscription created';
  ELSE
    RAISE NOTICE '[WORKSPACE-CREATE] ⚠️ No free plan found - skipping subscription';
  END IF;
  
  -- ============================================================================
  -- Success summary
  -- ============================================================================
  
  RAISE NOTICE '==================================================';
  RAISE NOTICE '[WORKSPACE-CREATE] 🎉 SUCCESS!';
  RAISE NOTICE '[WORKSPACE-CREATE] Organization ID: %', v_org_id;
  RAISE NOTICE '[WORKSPACE-CREATE] Workspace Name: "%"', v_workspace_name;
  RAISE NOTICE '[WORKSPACE-CREATE] Workspace Slug: %', v_slug;
  RAISE NOTICE '[WORKSPACE-CREATE] User ID: %', NEW.id;
  RAISE NOTICE '[WORKSPACE-CREATE] Completed at: %', NOW();
  RAISE NOTICE '==================================================';
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[WORKSPACE-CREATE] ❌ ERROR!';
    RAISE NOTICE '[WORKSPACE-CREATE] User ID: %', NEW.id;
    RAISE NOTICE '[WORKSPACE-CREATE] Error: %', SQLERRM;
    RAISE NOTICE '[WORKSPACE-CREATE] Detail: %', SQLSTATE;
    RAISE NOTICE '==================================================';
    
    -- Re-raise the error so it's visible
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Recreate trigger
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE '[MIGRATION] Creating trigger: auto_create_workspace_trigger';
  RAISE NOTICE '[MIGRATION] Trigger will fire: AFTER INSERT ON profiles';
  RAISE NOTICE '[MIGRATION] For each row: YES';
  RAISE NOTICE '==================================================';
END $$;

CREATE TRIGGER auto_create_workspace_trigger
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_personal_workspace();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Check that trigger exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'auto_create_workspace_trigger'
  ) THEN
    RAISE NOTICE '==================================================';
    RAISE NOTICE '[MIGRATION] ✅ Trigger created successfully';
    RAISE NOTICE '[MIGRATION] Trigger name: auto_create_workspace_trigger';
    RAISE NOTICE '[MIGRATION] Table: profiles';
    RAISE NOTICE '[MIGRATION] Timing: AFTER INSERT';
    RAISE NOTICE '==================================================';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEXT STEPS:';
    RAISE NOTICE '1. Create a new user profile';
    RAISE NOTICE '2. Watch server logs for [WORKSPACE-CREATE] messages';
    RAISE NOTICE '3. If you see multiple [WORKSPACE-CREATE] 🚀 TRIGGER FIRED messages,';
    RAISE NOTICE '   then the trigger is being called multiple times';
    RAISE NOTICE '4. The logs will show exactly when and why duplicates happen';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 WHAT TO LOOK FOR:';
    RAISE NOTICE '- How many times does "🚀 TRIGGER FIRED" appear?';
    RAISE NOTICE '- Does "⚠️ SKIPPING" appear (meaning duplicate check worked)?';
    RAISE NOTICE '- Are multiple organizations created (check org IDs)?';
    RAISE NOTICE '';
    RAISE NOTICE '==================================================';
  ELSE
    RAISE EXCEPTION 'Trigger was not created successfully!';
  END IF;
END $$;
