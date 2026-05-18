-- Migration: Auto-create personal workspace for new users
-- Creates a personal organization + free subscription when a profile is created
--
-- HISTORICAL: This trigger was disabled by migration 042. The plan lookup
-- below (`WHERE name = 'free'`) is also stale — migration 073 renamed that
-- plan to 'starter'. See supabase/migrations/20260408110000_plan_assignment_hardening.sql
-- for the production-hardened replacement (AFTER INSERT trigger on
-- organizations + check_usage_limit fallback).

-- ============================================================================
-- Function: Auto-create personal workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
BEGIN
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
      'stripe_card',  -- Use stripe_card for free plans (no actual charges)
      NOW(),
      NOW() + INTERVAL '100 years',  -- Free plan never expires
      NOW(),
      NOW()
    );
  END IF;
  
  RAISE NOTICE 'Auto-created personal workspace % for user %', v_org_id, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Create workspace on profile insert
-- ============================================================================

DROP TRIGGER IF EXISTS auto_create_workspace_trigger ON profiles;

CREATE TRIGGER auto_create_workspace_trigger
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_personal_workspace();

-- ============================================================================
-- Backfill: Create workspaces for existing users without one
-- ============================================================================

DO $$
DECLARE
  v_profile RECORD;
  v_org_id UUID;
  v_slug TEXT;
  v_plan_id UUID;
BEGIN
  -- Get free plan ID
  SELECT id INTO v_plan_id 
  FROM plans 
  WHERE name = 'free' 
  LIMIT 1;
  
  -- For each profile without an organization
  FOR v_profile IN 
    SELECT p.id, p.handle
    FROM profiles p
    LEFT JOIN organization_members om ON p.id = om.user_id
    WHERE om.id IS NULL
  LOOP
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
      v_profile.handle || '''s Workspace',
      'personal',
      v_profile.id,
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
      v_profile.id,
      'owner',
      NOW(),
      NOW()
    );
    
    -- Create free subscription (if plan exists)
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
        'stripe_card',  -- Use stripe_card for free plans (no actual charges)
        NOW(),
        NOW() + INTERVAL '100 years',
        NOW(),
        NOW()
      );
    END IF;
    
    RAISE NOTICE 'Backfilled workspace % for existing user %', v_org_id, v_profile.id;
  END LOOP;
END $$;

-- ============================================================================
-- Success!
-- ============================================================================
-- From now on, all new users will automatically get:
-- 1. Personal organization (type='personal')
-- 2. Owner membership
-- 3. Free plan subscription (active forever)
--
-- Existing users without workspaces have been backfilled.
