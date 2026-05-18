-- ============================================
-- SUPABASE MARKETPLACE DATABASE SCHEMA - SAFE VERSION
-- ============================================
-- This version checks for existing tables and policies
-- Safe to run after migrations 001-012

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ORGANIZATIONS (Skip - created by migration 010)
-- ============================================
-- organizations table already exists from migration 010
-- organization_members table already exists from migration 010
-- We'll just ensure indexes exist

CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_verified ON public.organizations(verified) WHERE verified = true;

-- ============================================
-- 2. ASSETS OVERLAY (Links to ES/API)
-- ============================================

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('MODEL', 'DATASET', 'AGENT', 'COMPUTE')),
  owner_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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
-- 3. CATEGORIES
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
-- 4. RATINGS (Skip - already created by migrations)
-- ============================================
-- ratings table already exists from other migrations
-- We'll just ensure indexes exist

CREATE INDEX IF NOT EXISTS idx_ratings_asset_id ON public.ratings(asset_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings(user_id);

-- ============================================
-- 5. RATING AGGREGATES (Materialized View)
-- ============================================

DO $$
BEGIN
    -- Drop and recreate materialized view
    DROP MATERIALIZED VIEW IF EXISTS public.asset_rating_agg CASCADE;
    
    CREATE MATERIALIZED VIEW public.asset_rating_agg AS
      SELECT 
        asset_id,
        COUNT(*)::INTEGER AS rating_count,
        AVG(score)::NUMERIC(3, 2) AS rating_avg
      FROM public.ratings
      GROUP BY asset_id;
    
    CREATE UNIQUE INDEX mv_asset_rating_agg_pk ON public.asset_rating_agg(asset_id);
END $$;

-- Function to refresh rating aggregates
CREATE OR REPLACE FUNCTION refresh_asset_rating_agg()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_rating_agg;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh on rating changes
DROP TRIGGER IF EXISTS trigger_refresh_rating_agg ON public.ratings;
CREATE TRIGGER trigger_refresh_rating_agg
AFTER INSERT OR UPDATE OR DELETE ON public.ratings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_asset_rating_agg();

-- ============================================
-- 6. FOLLOWS (Organizations) - Skip if exists
-- ============================================
-- follows_orgs table may already exist from other migrations

CREATE INDEX IF NOT EXISTS idx_follows_orgs_follower ON public.follows_orgs(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_orgs_org ON public.follows_orgs(org_id);

-- ============================================
-- 7. BOOKMARKS (Skip - already exists)
-- ============================================
-- bookmarks table already exists from other migrations

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_asset_id ON public.bookmarks(asset_id);

-- ============================================
-- 8. RUNS & RECEIPTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  asset_external_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'pin')),
  policy_hash TEXT NOT NULL,
  venue TEXT NOT NULL,
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
-- 9. RUN AGGREGATES (Materialized View)
-- ============================================

DO $$
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS public.asset_run_agg CASCADE;
    
    CREATE MATERIALIZED VIEW public.asset_run_agg AS
      SELECT 
        asset_id,
        COUNT(*)::INTEGER AS runs_count_30d
      FROM public.runs
      WHERE created_at >= now() - INTERVAL '30 days'
      GROUP BY asset_id;
    
    CREATE UNIQUE INDEX mv_asset_run_agg_pk ON public.asset_run_agg(asset_id);
END $$;

-- Function to refresh run aggregates
CREATE OR REPLACE FUNCTION refresh_asset_run_agg()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_run_agg;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh on run changes
DROP TRIGGER IF EXISTS trigger_refresh_run_agg ON public.runs;
CREATE TRIGGER trigger_refresh_run_agg
AFTER INSERT OR DELETE ON public.runs
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_asset_run_agg();

-- ============================================
-- 10. ORGANIZATION STATS (Materialized View)
-- ============================================

DO $$
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS public.organization_stats CASCADE;
    
    CREATE MATERIALIZED VIEW public.organization_stats AS
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
    
    CREATE UNIQUE INDEX mv_org_stats_pk ON public.organization_stats(org_id);
END $$;

-- ============================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on new tables only
ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.runs ENABLE ROW LEVEL SECURITY;

-- Create policies safely (check existence first)
DO $$ 
BEGIN
    -- Assets policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'assets' 
        AND policyname = 'Public assets are viewable by everyone'
    ) THEN
        CREATE POLICY "Public assets are viewable by everyone" 
        ON public.assets FOR SELECT 
        USING (visibility = 'PUBLIC');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'assets' 
        AND policyname = 'Authenticated users can create assets'
    ) THEN
        CREATE POLICY "Authenticated users can create assets" 
        ON public.assets FOR INSERT 
        TO authenticated 
        WITH CHECK (true);
    END IF;
    
    -- Runs policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'runs' 
        AND policyname = 'Users can view their own runs'
    ) THEN
        CREATE POLICY "Users can view their own runs" 
        ON public.runs FOR SELECT 
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'runs' 
        AND policyname = 'Authenticated users can create runs'
    ) THEN
        CREATE POLICY "Authenticated users can create runs" 
        ON public.runs FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id);
    END IF;
    
    -- Categories policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'categories' 
        AND policyname = 'Categories are viewable by everyone'
    ) THEN
        CREATE POLICY "Categories are viewable by everyone" 
        ON public.categories FOR SELECT 
        USING (true);
    END IF;
END $$;

-- ============================================
-- 12. UPDATE TRIGGERS
-- ============================================

-- Add triggers for updated_at (if tables exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_assets_updated_at'
    ) THEN
        CREATE TRIGGER update_assets_updated_at 
        BEFORE UPDATE ON public.assets 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
    table_count INT;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('assets', 'categories', 'runs', 'asset_categories');
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MARKETPLACE SCHEMA COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'New marketplace tables created: %', table_count;
    RAISE NOTICE 'Organizations table: Already exists (from migration 010)';
    RAISE NOTICE 'Ratings/Bookmarks/Follows: Already exist (from migrations)';
    RAISE NOTICE '==================================================';
END $$;
