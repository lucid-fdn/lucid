-- Fix existing user profiles with handle-based display names
-- This updates profiles where name = handle (e.g., name = "user_xxxxx")

-- Show affected users first
SELECT 
  id,
  name as current_name,
  handle,
  email,
  created_at
FROM profiles
WHERE name = handle
  AND handle LIKE 'user_%'
ORDER BY created_at DESC;

-- Update: Set name to NULL so users can update it in settings
-- (Or you can set a friendly default like 'User')

UPDATE profiles
SET name = NULL,
    updated_at = NOW()
WHERE name = handle
  AND handle LIKE 'user_%';

-- Verify results
SELECT 
  id,
  name,
  handle,
  email,
  CASE 
    WHEN name IS NULL THEN '✅ Fixed (NULL - ready for user update)'
    WHEN name != handle THEN '✅ Has custom name'
    ELSE '⚠️ Still using handle'
  END as status
FROM profiles
ORDER BY updated_at DESC
LIMIT 10;
