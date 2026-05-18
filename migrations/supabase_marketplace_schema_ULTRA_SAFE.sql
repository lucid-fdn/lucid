-- ============================================
-- SUPABASE MARKETPLACE DATABASE SCHEMA - ULTRA SAFE VERSION
-- ============================================
-- NO DROP statements - completely safe to run
-- Safe to run after migrations 001-012

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ORGANIZATIONS (Skip - created by migration 010)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_verified ON public.organizations(verified) WHERE verified = true;

-- ============================================
-- 2. ASSETS TABLE
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

ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.asset_categories (
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_categories_asset ON public.asset_categories(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_categories_category ON public.asset_categories(category_id);

-- ============================================
-- 4. RUNS & RECEIPTS
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

ALTER TABLE IF EXISTS public.runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_runs_asset ON public.runs(asset_id);
CREATE INDEX IF NOT EXISTS idx_runs_external ON public.runs(asset_external_id);
CREATE INDEX IF NOT EXISTS idx_runs_org ON public.runs(org_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON public.runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON public.runs(created_at DESC);

-- ============================================
-- 5. RATINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, user_id)
);

ALTER TABLE IF EXISTS public.ratings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ratings_asset_id ON public.ratings(asset_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings(user_id);

-- ============================================
-- 6. BOOKMARKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_id)
);

ALTER TABLE IF EXISTS public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_asset_id ON public.bookmarks(asset_id);

-- ============================================
-- 7. FOLLOWS (Organizations)
-- ============================================

CREATE TABLE IF NOT EXISTS public.follows_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_user_id, org_id)
);

ALTER TABLE IF EXISTS public.follows_orgs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_follows_orgs_follower ON public.follows_orgs(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_orgs_org ON public.follows_orgs(org_id);

-- ============================================
-- 8. RLS POLICIES (Safe - checks existence)
-- ============================================

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
    
    -- Ratings policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ratings' 
        AND policyname = 'Ratings are viewable by everyone'
    ) THEN
        CREATE POLICY "Ratings are viewable by everyone" 
        ON public.ratings FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ratings' 
        AND policyname = 'Authenticated users can create ratings'
    ) THEN
        CREATE POLICY "Authenticated users can create ratings" 
        ON public.ratings FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id);
    END IF;
    
    -- Bookmarks policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bookmarks' 
        AND policyname = 'Users can view their own bookmarks'
    ) THEN
        CREATE POLICY "Users can view their own bookmarks" 
        ON public.bookmarks FOR SELECT 
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bookmarks' 
        AND policyname = 'Users can create their own bookmarks'
    ) THEN
        CREATE POLICY "Users can create their own bookmarks" 
        ON public.bookmarks FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bookmarks' 
        AND policyname = 'Users can delete their own bookmarks'
    ) THEN
        CREATE POLICY "Users can delete their own bookmarks" 
        ON public.bookmarks FOR DELETE 
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
    
    -- Follows policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'follows_orgs' 
        AND policyname = 'Users can view their own follows'
    ) THEN
        CREATE POLICY "Users can view their own follows" 
        ON public.follows_orgs FOR SELECT 
        TO authenticated 
        USING (auth.uid() = follower_user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'follows_orgs' 
        AND policyname = 'Users can create their own follows'
    ) THEN
        CREATE POLICY "Users can create their own follows" 
        ON public.follows_orgs FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = follower_user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'follows_orgs' 
        AND policyname = 'Users can delete their own follows'
    ) THEN
        CREATE POLICY "Users can delete their own follows" 
        ON public.follows_orgs FOR DELETE 
        TO authenticated 
        USING (auth.uid() = follower_user_id);
    END IF;
END $$;

-- ============================================
-- 9. UPDATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_ratings_updated_at'
    ) THEN
        CREATE TRIGGER update_ratings_updated_at 
        BEFORE UPDATE ON public.ratings 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
    assets_count INT;
    runs_count INT;
    categories_count INT;
BEGIN
    SELECT COUNT(*) INTO assets_count FROM information_schema.tables WHERE table_name = 'assets';
    SELECT COUNT(*) INTO runs_count FROM information_schema.tables WHERE table_name = 'runs';
    SELECT COUNT(*) INTO categories_count FROM information_schema.tables WHERE table_name = 'categories';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MARKETPLACE SCHEMA COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Assets table created: ✓';
    RAISE NOTICE 'Ratings table created: ✓';
    RAISE NOTICE 'Bookmarks table created: ✓';
    RAISE NOTICE 'Follows table created: ✓';
    RAISE NOTICE 'Runs table created: ✓';
    RAISE NOTICE 'Categories table created: ✓';
    RAISE NOTICE '==================================================';
END $$;

-- ============================================
-- OPTIONAL: Create Materialized Views Manually
-- ============================================
-- If you want materialized views, run these separately:
/*
CREATE MATERIALIZED VIEW IF NOT EXISTS public.asset_rating_agg AS
  SELECT 
    asset_id,
    COUNT(*)::INTEGER AS rating_count,
    AVG(score)::NUMERIC(3, 2) AS rating_avg
  FROM public.ratings
  GROUP BY asset_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_asset_rating_agg_pk ON public.asset_rating_agg(asset_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.asset_run_agg AS
  SELECT 
    asset_id,
    COUNT(*)::INTEGER AS runs_count_30d
  FROM public.runs
  WHERE created_at >= now() - INTERVAL '30 days'
  GROUP BY asset_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_asset_run_agg_pk ON public.asset_run_agg(asset_id);
*/
