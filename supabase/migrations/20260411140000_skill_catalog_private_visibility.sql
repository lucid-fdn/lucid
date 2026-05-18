-- Support org-private promoted native skills without leaking them into the
-- global catalog browse surfaces.

ALTER TABLE skill_catalog
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS owner_org_id UUID,
  ADD COLUMN IF NOT EXISTS origin_mutation_candidate_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skill_catalog_visibility_check'
  ) THEN
    ALTER TABLE skill_catalog
      ADD CONSTRAINT skill_catalog_visibility_check
      CHECK (visibility IN ('global', 'org_private'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skill_catalog_visibility_status
  ON skill_catalog (visibility, status);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_owner_org_status
  ON skill_catalog (owner_org_id, status)
  WHERE owner_org_id IS NOT NULL;
