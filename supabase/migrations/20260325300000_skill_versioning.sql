-- Skill versioning + update propagation
-- Adds version tracking to catalog, content snapshots to installations,
-- and update-available detection across the 3-tier governance.

-- 1. Catalog: add version + changelog
ALTER TABLE skill_catalog
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS changelog TEXT;

COMMENT ON COLUMN skill_catalog.version IS 'Auto-incremented on content change (import pipeline bumps this)';
COMMENT ON COLUMN skill_catalog.changelog IS 'Human-readable summary of what changed in this version';

-- 2. Installations: snapshot the version + content_hash at install time
ALTER TABLE org_skill_installations
  ADD COLUMN IF NOT EXISTS installed_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installed_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS auto_update BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN org_skill_installations.installed_version IS 'Catalog version at install time';
COMMENT ON COLUMN org_skill_installations.installed_content_hash IS 'content_hash at install time — used to detect updates';
COMMENT ON COLUMN org_skill_installations.auto_update IS 'When true, runtime uses latest approved catalog content instead of snapshot';

-- 3. Efficient update detection: RPC that returns org installations where catalog has changed
CREATE OR REPLACE FUNCTION check_skill_updates(p_org_id UUID)
RETURNS TABLE (
  installation_id UUID,
  skill_slug TEXT,
  skill_name TEXT,
  installed_version INT,
  catalog_version INT,
  changelog TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS installation_id,
    s.slug AS skill_slug,
    s.name AS skill_name,
    i.installed_version,
    s.version AS catalog_version,
    s.changelog
  FROM org_skill_installations i
  JOIN skill_catalog s ON s.id = i.skill_id
  WHERE i.org_id = p_org_id
    AND s.status = 'approved'
    AND s.version > i.installed_version;
$$;

-- 4. Apply a single update: bumps installation to current catalog version
CREATE OR REPLACE FUNCTION apply_skill_update(p_installation_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version INT;
  v_hash TEXT;
BEGIN
  -- Get current catalog version for this installation's skill
  SELECT s.version, s.content_hash
  INTO v_version, v_hash
  FROM org_skill_installations i
  JOIN skill_catalog s ON s.id = i.skill_id
  WHERE i.id = p_installation_id
    AND i.org_id = p_org_id
    AND s.status = 'approved';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE org_skill_installations
  SET installed_version = v_version,
      installed_content_hash = v_hash
  WHERE id = p_installation_id
    AND org_id = p_org_id;

  RETURN TRUE;
END;
$$;

-- 5. Batch apply all updates for an org (auto_update=true only)
CREATE OR REPLACE FUNCTION apply_all_skill_updates(p_org_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE org_skill_installations i
  SET installed_version = s.version,
      installed_content_hash = s.content_hash
  FROM skill_catalog s
  WHERE s.id = i.skill_id
    AND i.org_id = p_org_id
    AND i.auto_update = true
    AND s.status = 'approved'
    AND s.version > i.installed_version;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
