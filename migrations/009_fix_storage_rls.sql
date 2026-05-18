-- ============================================================================
-- Fix Storage RLS Policies for Avatar Upload
-- ============================================================================
-- Issue: Service role uploads are blocked by RLS policy
-- Solution: Allow service_role to bypass RLS or update policy

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Allow service role to upload (server-side uploads)
CREATE POLICY "Service role can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND (
    auth.role() = 'service_role'  -- Server-side uploads
    OR auth.role() = 'authenticated'  -- Direct user uploads (if needed)
  )
);

-- Allow service role to update
CREATE POLICY "Service role can update avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'service_role'
);

-- Allow service role to delete
CREATE POLICY "Service role can delete avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'service_role'
);

-- Same for org-logos
DROP POLICY IF EXISTS "Authenticated users can upload org logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update org logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete org logos" ON storage.objects;

CREATE POLICY "Service role can upload org logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'org-logos'
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can update org logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'org-logos'
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can delete org logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-logos'
  AND auth.role() = 'service_role'
);

-- Verify policies
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'objects'
AND policyname LIKE '%avatars%' OR policyname LIKE '%logos%';
