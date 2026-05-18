-- ============================================================================
-- Storage Buckets for User-Generated Content (FIXED - Safe to Run)
-- ============================================================================

-- Create avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create org-logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create uploads bucket (general files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Row Level Security (RLS) Policies (Safe - Checks if exists first)
-- ============================================================================

-- Drop existing policies if they exist (safe cleanup)
DO $$ 
BEGIN
    -- Avatars policies
    DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
    
    -- Org logos policies
    DROP POLICY IF EXISTS "Public can view org logos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload org logos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can update org logos" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete org logos" ON storage.objects;
    
    -- Uploads policies
    DROP POLICY IF EXISTS "Public can view uploads" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own uploads" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own uploads" ON storage.objects;
END $$;

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

-- Org logos: Anyone can view, only authenticated users can manage
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

-- Uploads: Anyone can view, users manage their own
CREATE POLICY "Public can view uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own uploads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
    bucket_count INT;
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO bucket_count FROM storage.buckets WHERE id IN ('avatars', 'org-logos', 'uploads');
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'STORAGE BUCKETS MIGRATION COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Buckets created: %', bucket_count;
    RAISE NOTICE 'Storage policies created: %', policy_count;
    RAISE NOTICE '==================================================';
END $$;
