-- ============================================================================
-- User Preferences System
-- ============================================================================
-- Centralized storage for UI state and user settings
-- Loads server-side with workspace for instant UI state

-- ============================================================================
-- User Preferences Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- UI State
  sidebar_collapsed BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT DEFAULT 'en',
  
  -- Display Preferences
  compact_mode BOOLEAN DEFAULT false,
  show_onboarding BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Function: Get user preferences with defaults
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_preferences(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  sidebar_collapsed BOOLEAN,
  theme TEXT,
  language TEXT,
  compact_mode BOOLEAN,
  show_onboarding BOOLEAN
) AS $$
BEGIN
  -- Try to get existing preferences
  RETURN QUERY
  SELECT 
    up.user_id,
    up.sidebar_collapsed,
    up.theme,
    up.language,
    up.compact_mode,
    up.show_onboarding
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
  
  -- If no preferences exist, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      p_user_id,
      false::BOOLEAN,  -- sidebar_collapsed default
      'system'::TEXT,   -- theme default
      'en'::TEXT,       -- language default
      false::BOOLEAN,  -- compact_mode default
      true::BOOLEAN    -- show_onboarding default
    ;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- Success Message
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ User preferences system created successfully';
  RAISE NOTICE '   - Table: user_preferences';
  RAISE NOTICE '   - RLS Policies: 3';
  RAISE NOTICE '   - Helper Function: get_user_preferences';
END $$;
