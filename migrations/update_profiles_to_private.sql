-- Update all user profiles to private
-- Run this once to set all existing users to private profiles

UPDATE profiles 
SET profile_public = false 
WHERE profile_public = true OR profile_public IS NULL;

-- Verify the update
SELECT 
  COUNT(*) as total_profiles,
  COUNT(*) FILTER (WHERE profile_public = false) as private_profiles,
  COUNT(*) FILTER (WHERE profile_public = true) as public_profiles
FROM profiles;
