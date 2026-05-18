-- Migration: Social Follow System
-- Creates tables for following organizations and contributors

-- Create org_follows table
CREATE TABLE IF NOT EXISTS public.org_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT org_follows_unique UNIQUE(user_id, org_id)
);

-- Create contributor_follows table
CREATE TABLE IF NOT EXISTS public.contributor_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contributor_follows_unique UNIQUE(follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS org_follows_user_id_idx ON public.org_follows(user_id);
CREATE INDEX IF NOT EXISTS org_follows_org_id_idx ON public.org_follows(org_id);
CREATE INDEX IF NOT EXISTS org_follows_created_at_idx ON public.org_follows(created_at);

CREATE INDEX IF NOT EXISTS contributor_follows_follower_id_idx ON public.contributor_follows(follower_id);
CREATE INDEX IF NOT EXISTS contributor_follows_following_id_idx ON public.contributor_follows(following_id);
CREATE INDEX IF NOT EXISTS contributor_follows_created_at_idx ON public.contributor_follows(created_at);

-- Enable RLS
ALTER TABLE public.org_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for org_follows
CREATE POLICY "Anyone can view org follows"
  ON public.org_follows FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own org follows"
  ON public.org_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own org follows"
  ON public.org_follows FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for contributor_follows
CREATE POLICY "Anyone can view contributor follows"
  ON public.contributor_follows FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own follows"
  ON public.contributor_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
  ON public.contributor_follows FOR DELETE
  USING (auth.uid() = follower_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.org_follows TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.contributor_follows TO authenticated;

-- Service role needs full access
GRANT ALL ON public.org_follows TO service_role;
GRANT ALL ON public.contributor_follows TO service_role;
