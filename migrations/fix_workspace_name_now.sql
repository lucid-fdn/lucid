-- Quick Fix: Update your personal workspace name to use your actual name
-- Run this directly in Supabase SQL Editor

-- Step 1: Check current workspace name
SELECT 
  o.id,
  o.name as current_name,
  o.slug,
  o.type,
  p.first_name,
  p.first_name || '''s Workspace' as new_name
FROM organizations o
INNER JOIN organization_members om ON om.organization_id = o.id
INNER JOIN profiles p ON p.id = om.user_id
WHERE o.type = 'personal'
  AND om.role = 'owner'
  AND o.name LIKE '%''s Workspace';

-- Step 2: Update all personal workspaces to use actual names
UPDATE organizations o
SET name = p.first_name || '''s Workspace',
    updated_at = NOW()
FROM profiles p
INNER JOIN organization_members om ON om.user_id = p.id
WHERE o.id = om.organization_id
  AND o.type = 'personal'
  AND om.role = 'owner'
  AND p.first_name IS NOT NULL
  AND p.first_name != ''
  AND o.name LIKE '%''s Workspace'
  AND o.name != p.first_name || '''s Workspace'; -- Only if not already correct

-- Step 3: Verify the update
SELECT 
  o.id,
  o.name as workspace_name,
  o.slug,
  p.first_name,
  p.name as full_name
FROM organizations o
INNER JOIN organization_members om ON om.organization_id = o.id
INNER JOIN profiles p ON p.id = om.user_id
WHERE o.type = 'personal'
  AND om.role = 'owner'
ORDER BY o.created_at DESC;
