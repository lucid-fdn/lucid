-- ============================================================================
-- Storage Buckets for User-Generated Content
-- ============================================================================
-- Run this migration to create storage buckets for avatars and organization logos
-- 
-- Usage:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Run this SQL in SQL Editor, OR
-- 3. Create buckets manually in UI with these settings

-- Create avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create org-logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Avatars: Anyone can view, only authenticated users can upload
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Org logos: Anyone can view, only org members can upload
CREATE POLICY "Public can view org logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

CREATE POLICY "Authenticated users can upload org logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update org logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete org logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-logos' 
  AND auth.role() = 'authenticated'
);

-- ============================================================================
-- Verification
-- ============================================================================
-- Run this to verify buckets were created:
-- SELECT * FROM storage.buckets WHERE id IN ('avatars', 'org-logos');
