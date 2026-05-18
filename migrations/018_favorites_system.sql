-- ============================================================================
-- Favorites System
-- ============================================================================
-- Polymorphic favorites table for projects, agents, apps, etc.
-- Supports drag-to-reorder, star toggle, and right-click remove

-- ============================================================================
-- Clean up (in case of previous failed migration)
-- ============================================================================
DROP TABLE IF EXISTS favorites CASCADE;

-- ============================================================================
-- Favorites Table
-- ============================================================================
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Polymorphic reference (scalable for any entity)
  favoritable_type TEXT NOT NULL CHECK (favoritable_type IN ('project', 'agent', 'app', 'page', 'data_source')),
  favoritable_id UUID NOT NULL,
  
  -- Ordering (for drag-to-reorder)
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata (denormalized for performance - no joins needed in sidebar)
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate favorites
  UNIQUE(user_id, org_id, favoritable_type, favoritable_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_favorites_user_org ON favorites(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_favorites_sort_order ON favorites(user_id, org_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(favoritable_type);
CREATE INDEX IF NOT EXISTS idx_favorites_poly ON favorites(favoritable_type, favoritable_id);

-- ============================================================================
-- RLS Policies (Security)
-- ============================================================================
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view own favorites"
  ON favorites FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "Users can insert own favorites"
  ON favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own favorites
CREATE POLICY "Users can update own favorites"
  ON favorites FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete own favorites"
  ON favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get user's favorites for current org (ordered by sort_order)
CREATE OR REPLACE FUNCTION get_user_favorites(p_user_id UUID, p_org_id UUID)
RETURNS TABLE (
  id UUID,
  favoritable_type TEXT,
  favoritable_id UUID,
  sort_order INTEGER,
  name TEXT,
  url TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.favoritable_type,
    f.favoritable_id,
    f.sort_order,
    f.name,
    f.url,
    f.icon,
    f.created_at
  FROM favorites f
  WHERE f.user_id = p_user_id 
    AND f.org_id = p_org_id
  ORDER BY f.sort_order ASC, f.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Reorder favorites (update sort_order after drag-drop)
CREATE OR REPLACE FUNCTION reorder_favorites(
  p_user_id UUID,
  p_org_id UUID,
  p_favorite_ids UUID[]
)
RETURNS VOID AS $$
DECLARE
  v_sort_order INTEGER := 0;
  v_favorite_id UUID;
BEGIN
  -- Update sort_order for each favorite in the new order
  FOREACH v_favorite_id IN ARRAY p_favorite_ids
  LOOP
    UPDATE favorites
    SET sort_order = v_sort_order,
        updated_at = NOW()
    WHERE id = v_favorite_id
      AND user_id = p_user_id
      AND org_id = p_org_id;
    
    v_sort_order := v_sort_order + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- Success Message
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Favorites system created successfully';
  RAISE NOTICE '   - Table: favorites';
  RAISE NOTICE '   - Indexes: 4';
  RAISE NOTICE '   - RLS Policies: 4';
  RAISE NOTICE '   - Helper Functions: 2';
END $$;
