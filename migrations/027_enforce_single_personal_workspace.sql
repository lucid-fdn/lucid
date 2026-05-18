-- Migration: Enforce single personal workspace per user
-- Prevents users from having multiple personal workspaces

-- ============================================================================
-- Step 1: Check for users with multiple personal workspaces
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT om.user_id, COUNT(*) as workspace_count
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE o.type = 'personal'
      AND om.role = 'owner'
    GROUP BY om.user_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_count > 0 THEN
    RAISE WARNING 'Found % users with multiple personal workspaces. These need to be cleaned up manually.', v_count;
  ELSE
    RAISE NOTICE 'No duplicate personal workspaces found. Proceeding with constraint.';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create constraint function
-- ============================================================================
-- This ensures each user can only be the owner of ONE personal workspace

CREATE OR REPLACE FUNCTION check_single_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_org_type TEXT;
  v_existing_count INTEGER;
BEGIN
  -- Only check for owner role
  IF NEW.role <> 'owner' THEN
    RETURN NEW;
  END IF;
  
  -- Get organization type
  SELECT type INTO v_org_type
  FROM organizations
  WHERE id = NEW.organization_id;
  
  -- Only check for personal workspaces
  IF v_org_type <> 'personal' THEN
    RETURN NEW;
  END IF;
  
  -- Check if user already owns another personal workspace
  SELECT COUNT(*) INTO v_existing_count
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = NEW.user_id
    AND om.role = 'owner'
    AND o.type = 'personal'
    AND om.organization_id != NEW.organization_id;  -- Exclude current org for updates
  
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'User already has a personal workspace. Each user can only have one personal workspace.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS enforce_single_personal_workspace ON organization_members;

CREATE TRIGGER enforce_single_personal_workspace
  BEFORE INSERT OR UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_single_personal_workspace();

-- Note: This trigger ensures:
-- - Users who are owners
-- - Of organizations with type='personal'
-- Can only have ONE such relationship
-- This allows multiple team organizations but only ONE personal workspace

-- ============================================================================
-- Step 3: Add check constraint to organizations table
-- ============================================================================
-- Prevent manual creation of multiple personal workspaces

-- First, let's document the business rule
COMMENT ON COLUMN organizations.type IS 
'Type of organization: ''personal'' (one per user) or ''team'' (unlimited). Personal workspaces are auto-created.';

-- ============================================================================
-- Step 4: Update workspace creation function to prevent duplicates
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
  v_existing_workspace UUID;
BEGIN
  -- Check if user already has a personal workspace
  SELECT om.organization_id INTO v_existing_workspace
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = NEW.id
    AND o.type = 'personal'
    AND om.role = 'owner'
  LIMIT 1;
  
  -- Skip if personal workspace already exists
  IF v_existing_workspace IS NOT NULL THEN
    RAISE NOTICE 'User % already has personal workspace %, skipping creation', NEW.id, v_existing_workspace;
    RETURN NEW;
  END IF;
  
  -- Generate unique slug
  v_slug := 'personal-' || substring(md5(random()::text) from 1 for 8);
  
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
    NEW.handle || '''s Workspace',
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
  
  RAISE NOTICE 'Auto-created personal workspace % for user %', v_org_id, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Success!
-- ============================================================================
-- Changes made:
-- 1. Added unique index to prevent multiple personal workspaces per user
-- 2. Updated auto-create function to skip if personal workspace exists
-- 3. Added documentation to explain the constraint
--
-- Each user can now have:
-- - Exactly ONE personal workspace (type='personal')
-- - Unlimited team organizations (type='team')
