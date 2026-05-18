-- Fix existing personal workspaces to use actual user names
-- Run this in Supabase SQL Editor

-- Update ALL personal workspaces to use the user's actual name
UPDATE organizations o
SET name = p.name || '''s Workspace',
    updated_at = NOW()
FROM profiles p
INNER JOIN organization_members om ON om.organization_id = o.id AND om.user_id = p.id
WHERE o.type = 'personal'
  AND p.name IS NOT NULL
  AND p.name != ''
  AND p.name != o.name  -- Only update if workspace name doesn't match
  AND om.role = 'owner';  -- Ensure user is the owner

-- Verify the changes
SELECT 
  o.id as org_id,
  o.slug,
  o.name as workspace_name,
  p.name as user_name,
  p.handle as user_handle,
  CASE 
    WHEN o.name = p.name || '''s Workspace' THEN '✅ Fixed'
    ELSE '⚠️ Needs Fix'
  END as status
FROM organizations o
INNER JOIN organization_members om ON om.organization_id = o.id
INNER JOIN profiles p ON p.id = om.user_id
WHERE o.type = 'personal'
  AND om.role = 'owner'
ORDER BY o.updated_at DESC;
