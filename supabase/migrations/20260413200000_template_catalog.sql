-- Template catalog: one-click agent and team deployment specs.
-- Mirrors the 3-tier governance pattern of plugin_catalog and skill_catalog.

CREATE TABLE template_catalog (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  description      TEXT,
  category         TEXT        NOT NULL DEFAULT 'general',
  kind             TEXT        NOT NULL CHECK (kind IN ('agent', 'team')),
  source           TEXT        NOT NULL DEFAULT 'platform'
                               CHECK (source IN ('platform', 'community', 'org')),
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'pending_review', 'approved', 'deprecated')),
  is_public        BOOLEAN     NOT NULL DEFAULT FALSE,
  owner_org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  spec             JSONB       NOT NULL,
  params           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  preview_prompt   TEXT,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  install_count    INTEGER     NOT NULL DEFAULT 0,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_catalog_params_array CHECK (jsonb_typeof(params) = 'array'),
  CONSTRAINT template_catalog_spec_object CHECK (jsonb_typeof(spec) = 'object')
);

CREATE INDEX idx_template_catalog_status_source ON template_catalog (status, source);
CREATE INDEX idx_template_catalog_category       ON template_catalog (category);
CREATE INDEX idx_template_catalog_kind           ON template_catalog (kind);
CREATE INDEX idx_template_catalog_source         ON template_catalog (source);
CREATE INDEX idx_template_catalog_status         ON template_catalog (status);
CREATE INDEX idx_template_catalog_tags           ON template_catalog USING GIN (tags);
CREATE INDEX idx_template_catalog_install_count  ON template_catalog (install_count DESC);
CREATE INDEX idx_template_catalog_is_public      ON template_catalog (is_public);
CREATE INDEX idx_template_catalog_owner_org      ON template_catalog (owner_org_id) WHERE owner_org_id IS NOT NULL;
CREATE INDEX idx_template_catalog_created_by     ON template_catalog (created_by) WHERE created_by IS NOT NULL;

ALTER TABLE template_catalog ENABLE ROW LEVEL SECURITY;

-- Platform + community approved templates visible to all authenticated users.
-- Org templates visible only to members of the owning org.
CREATE POLICY template_catalog_select ON template_catalog
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      source = 'platform'
      OR (is_public = TRUE AND status = 'approved')
      OR (
        source = 'org'
        AND owner_org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY template_catalog_org_insert ON template_catalog
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND source = 'org'
    AND owner_org_id IS NOT NULL
    AND owner_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY template_catalog_org_update ON template_catalog
  FOR UPDATE USING (
    source = 'org'
    AND owner_org_id IS NOT NULL
    AND owner_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    source = 'org'
    AND owner_org_id IS NOT NULL
    AND owner_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY template_catalog_org_delete ON template_catalog
  FOR DELETE USING (
    source = 'org'
    AND owner_org_id IS NOT NULL
    AND owner_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY template_catalog_service_write ON template_catalog
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.set_template_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_template_catalog_updated_at ON template_catalog;

CREATE TRIGGER set_template_catalog_updated_at
  BEFORE UPDATE ON template_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.set_template_catalog_updated_at();

CREATE OR REPLACE FUNCTION public.increment_template_install_count(p_template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE template_catalog
  SET install_count = install_count + 1
  WHERE id = p_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_template_install_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_template_install_count(UUID) TO service_role;

CREATE TABLE template_deployments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES template_catalog(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  deployed_by  UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  params_used  JSONB       NOT NULL DEFAULT '{}',
  assistant_id UUID        REFERENCES ai_assistants(id) ON DELETE SET NULL,
  crew_id      UUID        REFERENCES crews(id)         ON DELETE SET NULL,
  deployed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_deployments_org      ON template_deployments (org_id, deployed_at DESC);
CREATE INDEX idx_template_deployments_template ON template_deployments (template_id);
CREATE INDEX idx_template_deployments_deployed_by ON template_deployments (deployed_by);
CREATE INDEX idx_template_deployments_assistant_id ON template_deployments (assistant_id) WHERE assistant_id IS NOT NULL;
CREATE INDEX idx_template_deployments_crew_id      ON template_deployments (crew_id) WHERE crew_id IS NOT NULL;

ALTER TABLE template_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_deployments_org_select ON template_deployments
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_deployments_org_insert ON template_deployments
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_deployments_service_write ON template_deployments
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (
    auth.role() = 'service_role'
  );

CREATE TABLE template_ratings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES template_catalog(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  rated_by     UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  rating       INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_ratings_template_org_user_unique UNIQUE (template_id, org_id, rated_by)
);

CREATE INDEX idx_template_ratings_template   ON template_ratings (template_id, created_at DESC);
CREATE INDEX idx_template_ratings_org        ON template_ratings (org_id, created_at DESC);
CREATE INDEX idx_template_ratings_rated_by   ON template_ratings (rated_by);

ALTER TABLE template_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_ratings_org_select ON template_ratings
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_ratings_org_insert ON template_ratings
  FOR INSERT WITH CHECK (
    rated_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_ratings_org_update ON template_ratings
  FOR UPDATE USING (
    rated_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    rated_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_ratings_org_delete ON template_ratings
  FOR DELETE USING (
    rated_by = auth.uid()
    AND org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY template_ratings_service_write ON template_ratings
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.set_template_ratings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_template_ratings_updated_at ON template_ratings;

CREATE TRIGGER set_template_ratings_updated_at
  BEFORE UPDATE ON template_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_template_ratings_updated_at();
