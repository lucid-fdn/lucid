-- Skill Import Pipeline: 3-tier skill management (mirrors plugin system)
-- Tables: skill_catalog, org_skill_installations, assistant_skill_activations
-- RPC: get_assistant_active_skills()

-- ============================================================
-- 1. skill_catalog — Global registry of importable skills
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  raw_content      TEXT NOT NULL,
  sanitized_content TEXT NOT NULL,
  frontmatter      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source           TEXT NOT NULL DEFAULT 'manual',
  source_path      TEXT,
  source_commit    TEXT,
  content_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  content_chars    INT NOT NULL,
  import_warnings  JSONB,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES profiles(id),
  review_notes     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_catalog_status_check CHECK (status IN ('draft', 'approved', 'deprecated')),
  CONSTRAINT skill_catalog_source_check CHECK (source IN ('openclaw', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_status ON skill_catalog(status);
CREATE INDEX IF NOT EXISTS idx_skill_catalog_source ON skill_catalog(source);

-- ============================================================
-- 2. org_skill_installations — Org-scoped skill installation
-- ============================================================
CREATE TABLE IF NOT EXISTS org_skill_installations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_id       UUID NOT NULL REFERENCES skill_catalog(id) ON DELETE CASCADE,
  installed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  installed_by   UUID REFERENCES profiles(id),

  UNIQUE(org_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_org_skill_installations_org ON org_skill_installations(org_id);

-- ============================================================
-- 3. assistant_skill_activations — Per-assistant activation
-- ============================================================
CREATE TABLE IF NOT EXISTS assistant_skill_activations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id     UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  installation_id  UUID NOT NULL REFERENCES org_skill_installations(id) ON DELETE CASCADE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 100,
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(assistant_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_skill_activations_assistant ON assistant_skill_activations(assistant_id);

-- ============================================================
-- 4. RPC: get_assistant_active_skills
-- ============================================================
CREATE OR REPLACE FUNCTION get_assistant_active_skills(p_assistant_id UUID)
RETURNS TABLE (
  skill_slug         TEXT,
  skill_name         TEXT,
  skill_description  TEXT,
  sanitized_content  TEXT,
  frontmatter        JSONB,
  sort_order         INT,
  content_chars      INT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sc.slug,
    sc.name,
    sc.description,
    sc.sanitized_content,
    sc.frontmatter,
    asa.sort_order,
    sc.content_chars
  FROM assistant_skill_activations asa
  JOIN org_skill_installations osi ON osi.id = asa.installation_id
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  -- Org ownership check: assistant's org must match installation's org
  JOIN ai_assistants aa ON aa.id = asa.assistant_id AND aa.org_id = osi.org_id
  WHERE asa.assistant_id = p_assistant_id
    AND asa.is_active = true
    AND sc.status = 'approved'
  ORDER BY asa.sort_order ASC, sc.name ASC;
$$;

-- ============================================================
-- 5. RLS Policies
-- ============================================================
ALTER TABLE skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_skill_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_skill_activations ENABLE ROW LEVEL SECURITY;

-- skill_catalog: authenticated users can browse approved skills
CREATE POLICY skill_catalog_select ON skill_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'approved');

-- org_skill_installations: org members can view
CREATE POLICY org_skill_installations_select ON org_skill_installations
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- org_skill_installations: org admins can install
CREATE POLICY org_skill_installations_insert ON org_skill_installations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- org_skill_installations: org admins can uninstall
CREATE POLICY org_skill_installations_delete ON org_skill_installations
  FOR DELETE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- assistant_skill_activations: org members can view
CREATE POLICY assistant_skill_activations_select ON assistant_skill_activations
  FOR SELECT USING (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid()
    )
  );

-- assistant_skill_activations: org admins can activate
CREATE POLICY assistant_skill_activations_insert ON assistant_skill_activations
  FOR INSERT WITH CHECK (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- assistant_skill_activations: org admins can update (toggle, reorder)
CREATE POLICY assistant_skill_activations_update ON assistant_skill_activations
  FOR UPDATE USING (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- assistant_skill_activations: org admins can deactivate
CREATE POLICY assistant_skill_activations_delete ON assistant_skill_activations
  FOR DELETE USING (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 6. Service role grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON skill_catalog TO service_role;
GRANT SELECT, INSERT, DELETE ON org_skill_installations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_skill_activations TO service_role;
GRANT EXECUTE ON FUNCTION get_assistant_active_skills TO service_role;
