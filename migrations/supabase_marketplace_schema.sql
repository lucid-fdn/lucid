-- ============================================
-- SUPABASE MARKETPLACE DATABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor to create all tables
-- for the marketplace overlay system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ORGANIZATIONS / COMPANIES
-- ============================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  location JSONB, -- e.g., {"city": "Paris", "country": "FR"}
  socials JSONB,  -- e.g., {"twitter": "@company", "github": "company"}
  verified BOOLEAN NOT NULL DEFAULT false,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for organizations
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_verified ON public.organizations(verified);

-- ============================================
-- 2. ORGANIZATION MEMBERSHIP
-- ============================================

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- Indexes for membership
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- ============================================
-- 3. ASSETS OVERLAY (Links to ES/API)
-- ============================================

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL, -- Links to Elasticsearch
  slug TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('MODEL', 'DATASET', 'AGENT', 'COMPUTE')),
  owner_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v0.1',
  summary TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  license TEXT,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'UNLISTED', 'PRIVATE')),
  eu_only BOOLEAN NOT NULL DEFAULT false,
  cc_on BOOLEAN NOT NULL DEFAULT false,
  p95_ms INTEGER,
  reliability NUMERIC(5, 2),
  cost_per_tok NUMERIC(12, 10),
  proven_runs INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for assets
CREATE INDEX IF NOT EXISTS idx_assets_external_id ON public.assets(external_id);
CREATE INDEX IF NOT EXISTS idx_assets_slug ON public.assets(slug);
CREATE INDEX IF NOT EXISTS idx_assets_owner_org ON public.assets(owner_org_id);
CREATE INDEX IF NOT EXISTS idx_assets_owner_user ON public.assets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON public.assets(kind);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON public.assets USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_assets_visibility ON public.assets(visibility);

-- ============================================
-- 4. CATEGORIES (Optional)
-- ============================================

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_categories (
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_categories_asset ON public.asset_categories(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_categories_category ON public.asset_categories(category_id);

-- ============================================
-- 5. RATINGS
-- ============================================

CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  run_id UUID, -- Optional link to a run
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_asset ON public.ratings(asset_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON public.ratings(user_id);

-- ============================================
-- 6. RATING AGGREGATES (Materialized View)
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.asset_rating_agg AS
  SELECT 
    asset_id,
    COUNT(*)::INTEGER AS rating_count,
    AVG(score)::NUMERIC(3, 2) AS rating_avg
  FROM public.ratings
  GROUP BY asset_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_asset_rating_agg_pk ON public.asset_rating_agg(asset_id);

-- Function to refresh rating aggregates
CREATE OR REPLACE FUNCTION refresh_asset_rating_agg()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_rating_agg;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh on rating changes
CREATE TRIGGER trigger_refresh_rating_agg
AFTER INSERT OR UPDATE OR DELETE ON public.ratings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_asset_rating_agg();

-- ============================================
-- 7. FOLLOWS (Organizations)
-- ============================================

CREATE TABLE IF NOT EXISTS public.follows_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_orgs_user ON public.follows_orgs(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_orgs_org ON public.follows_orgs(org_id);

-- ============================================
-- 8. BOOKMARKS
-- ============================================

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_asset ON public.bookmarks(asset_id);

-- ============================================
-- 9. RUNS & RECEIPTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  asset_external_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'pin')),
  policy_hash TEXT NOT NULL,
  venue TEXT NOT NULL, -- e.g., 'AWS_US_EAST', 'GCP_EU_WEST'
  p95_ms INTEGER,
  cost_est_usd NUMERIC(10, 5),
  attestation JSONB,
  receipt JSONB,
  mmr_root TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_asset ON public.runs(asset_id);
CREATE INDEX IF NOT EXISTS idx_runs_external ON public.runs(asset_external_id);
CREATE INDEX IF NOT EXISTS idx_runs_org ON public.runs(org_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON public.runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON public.runs(created_at DESC);

-- ============================================
-- 10. RUN AGGREGATES (Materialized View)
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.asset_run_agg AS
  SELECT 
    asset_id,
    COUNT(*)::INTEGER AS runs_count_30d
  FROM public.runs
  WHERE created_at >= now() - INTERVAL '30 days'
  GROUP BY asset_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_asset_run_agg_pk ON public.asset_run_agg(asset_id);

-- Function to refresh run aggregates
CREATE OR REPLACE FUNCTION refresh_asset_run_agg()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_run_agg;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh on run changes
CREATE TRIGGER trigger_refresh_run_agg
AFTER INSERT OR DELETE ON public.runs
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_asset_run_agg();

-- ============================================
-- 11. ORGANIZATION STATS (Materialized View)
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.organization_stats AS
  WITH asset_counts AS (
    SELECT 
      owner_org_id AS org_id, 
      COUNT(*)::INTEGER AS assets_count
    FROM public.assets 
    GROUP BY owner_org_id
  ),
  followers AS (
    SELECT 
      org_id, 
      COUNT(*)::INTEGER AS followers_count
    FROM public.follows_orgs 
    GROUP BY org_id
  )
  SELECT
    o.id AS org_id,
    COALESCE(a.assets_count, 0) AS assets_count,
    COALESCE(f.followers_count, 0) AS followers_count
  FROM public.organizations o
  LEFT JOIN asset_counts a ON a.org_id = o.id
  LEFT JOIN followers f ON f.org_id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_org_stats_pk ON public.organization_stats(org_id);

-- ============================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- Organizations: Public read, authenticated create
CREATE POLICY "Organizations are viewable by everyone" 
  ON public.organizations FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create organizations" 
  ON public.organizations FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Assets: Public read for PUBLIC visibility
CREATE POLICY "Public assets are viewable by everyone" 
  ON public.assets FOR SELECT 
  USING (visibility = 'PUBLIC');

CREATE POLICY "Authenticated users can create assets" 
  ON public.assets FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Ratings: Public read, users can rate
CREATE POLICY "Ratings are viewable by everyone" 
  ON public.ratings FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create ratings" 
  ON public.ratings FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- Bookmarks: Users can only see/manage their own
CREATE POLICY "Users can view their own bookmarks" 
  ON public.bookmarks FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bookmarks" 
  ON public.bookmarks FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks" 
  ON public.bookmarks FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Follows: Users can only see/manage their own
CREATE POLICY "Users can view their own follows" 
  ON public.follows_orgs FOR SELECT 
  TO authenticated 
  USING (auth.uid() = follower_user_id);

CREATE POLICY "Users can create their own follows" 
  ON public.follows_orgs FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = follower_user_id);

CREATE POLICY "Users can delete their own follows" 
  ON public.follows_orgs FOR DELETE 
  TO authenticated 
  USING (auth.uid() = follower_user_id);

-- Runs: Users can view their own and public runs
CREATE POLICY "Users can view their own runs" 
  ON public.runs FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create runs" 
  ON public.runs FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 13. HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_organizations_updated_at 
  BEFORE UPDATE ON public.organizations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at 
  BEFORE UPDATE ON public.assets 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ratings_updated_at 
  BEFORE UPDATE ON public.ratings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SCHEMA CREATION COMPLETE ✅
-- ============================================

-- To verify tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
