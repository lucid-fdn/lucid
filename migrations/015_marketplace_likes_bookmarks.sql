-- Migration: Marketplace Likes and Bookmarks Tables
-- Creates tables for asset likes and bookmarks functionality

-- Create asset_likes table
CREATE TABLE IF NOT EXISTS public.asset_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT asset_likes_unique UNIQUE(user_id, asset_id)
);

-- Create bookmarks table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT bookmarks_unique UNIQUE(user_id, asset_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS asset_likes_user_id_idx ON public.asset_likes(user_id);
CREATE INDEX IF NOT EXISTS asset_likes_asset_id_idx ON public.asset_likes(asset_id);
CREATE INDEX IF NOT EXISTS asset_likes_created_at_idx ON public.asset_likes(created_at);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS bookmarks_asset_id_idx ON public.bookmarks(asset_id);
CREATE INDEX IF NOT EXISTS bookmarks_created_at_idx ON public.bookmarks(created_at);

-- Enable RLS
ALTER TABLE public.asset_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Anyone can view asset likes" ON public.asset_likes;
DROP POLICY IF EXISTS "Users can create their own likes" ON public.asset_likes;
DROP POLICY IF EXISTS "Users can delete their own likes" ON public.asset_likes;
DROP POLICY IF EXISTS "Anyone can view bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can create their own bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can delete their own bookmarks" ON public.bookmarks;

-- RLS Policies for asset_likes
CREATE POLICY "Anyone can view asset likes"
  ON public.asset_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own likes"
  ON public.asset_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes"
  ON public.asset_likes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for bookmarks
CREATE POLICY "Anyone can view bookmarks"
  ON public.bookmarks FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own bookmarks"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.asset_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO authenticated;

-- Service role needs full access
GRANT ALL ON public.asset_likes TO service_role;
GRANT ALL ON public.bookmarks TO service_role;
