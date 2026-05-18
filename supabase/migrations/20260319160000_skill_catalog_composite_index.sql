-- Composite index for skill catalog browsing at scale (500+ skills).
-- The RPC and admin UI filter by status + slug frequently.
CREATE INDEX IF NOT EXISTS idx_skill_catalog_status_slug ON skill_catalog(status, slug);
