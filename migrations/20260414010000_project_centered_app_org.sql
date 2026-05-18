-- ============================================================================
-- Project-Centered App Organization
-- ============================================================================
-- Makes project the primary resource boundary without exposing multi-project UX
-- yet. Existing workspaces continue to use their hidden default project.

-- ----------------------------------------------------------------------------
-- 1. Crews become project-scoped
-- ----------------------------------------------------------------------------

ALTER TABLE crews
ADD COLUMN IF NOT EXISTS project_id UUID;

UPDATE crews
SET project_id = get_default_project_id(org_id)
WHERE project_id IS NULL;

ALTER TABLE crews
ALTER COLUMN project_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'crews_project_id_fkey'
      AND table_name = 'crews'
  ) THEN
    ALTER TABLE crews
    ADD CONSTRAINT crews_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crews_org_project
ON crews(org_id, project_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crew_runs_crew_id_created_at
ON crew_runs(crew_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Workflows become project-aware
-- ----------------------------------------------------------------------------

ALTER TABLE workflows
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

UPDATE workflows
SET project_id = get_default_project_id(organization_id)
WHERE organization_id IS NOT NULL
  AND project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_project_id
ON workflows(project_id);

CREATE INDEX IF NOT EXISTS idx_workflows_org_project
ON workflows(organization_id, project_id);

-- ----------------------------------------------------------------------------
-- 3. Org-owned templates can optionally be tied to a project
-- ----------------------------------------------------------------------------

ALTER TABLE template_catalog
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

UPDATE template_catalog
SET project_id = get_default_project_id(owner_org_id)
WHERE source = 'org'
  AND owner_org_id IS NOT NULL
  AND project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_template_catalog_owner_project
ON template_catalog(owner_org_id, project_id);

-- ----------------------------------------------------------------------------
-- 4. Notes
-- ----------------------------------------------------------------------------
-- The visible project picker remains disabled for MVP. The app should continue
-- to route users into their hidden default project until multi-project UX is
-- enabled.
