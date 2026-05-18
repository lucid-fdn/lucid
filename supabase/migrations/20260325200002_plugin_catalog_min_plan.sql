-- Add per-plugin plan gating
-- Allows specific plugins to require a minimum plan (e.g., 'pro', 'business')
-- Default 'starter' means available to all plans that have plugins enabled.

ALTER TABLE plugin_catalog
  ADD COLUMN IF NOT EXISTS min_plan TEXT NOT NULL DEFAULT 'starter'
  CHECK (min_plan IN ('starter', 'pro', 'business'));

COMMENT ON COLUMN plugin_catalog.min_plan IS 'Minimum plan required to install this plugin (starter, pro, business)';
