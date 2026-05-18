-- Extend skill catalog for canonical MCPGate mirroring and local warm installs.

ALTER TABLE skill_catalog
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_type IN ('internal', 'mcpgate', 'imported')),
  ADD COLUMN IF NOT EXISTS source_skill_id TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS trust_tier TEXT
    CHECK (trust_tier IN ('lucid_first_party', 'verified_partner', 'community', 'private_org')),
  ADD COLUMN IF NOT EXISTS capability_tier TEXT
    CHECK (capability_tier IN ('metadata_only', 'tool_backed', 'runtime_extended')),
  ADD COLUMN IF NOT EXISTS artifact_checksum TEXT,
  ADD COLUMN IF NOT EXISTS engine_support JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS artifact_manifest JSONB;

UPDATE skill_catalog
SET
  source_type = CASE
    WHEN source IN ('internal', 'mcpgate', 'imported') THEN source
    WHEN source = 'manual' THEN 'imported'
    ELSE 'internal'
  END,
  trust_tier = COALESCE(trust_tier, CASE
    WHEN source = 'internal' THEN 'lucid_first_party'
    ELSE 'community'
  END),
  capability_tier = COALESCE(capability_tier, 'metadata_only')
WHERE true;

ALTER TABLE org_skill_installations
  ADD COLUMN IF NOT EXISTS installed_source_version TEXT,
  ADD COLUMN IF NOT EXISTS installed_artifact_checksum TEXT;

CREATE TABLE IF NOT EXISTS skill_install_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skill_catalog(id) ON DELETE CASCADE,
  installation_id UUID REFERENCES org_skill_installations(id) ON DELETE CASCADE,
  source_variant_key TEXT NOT NULL,
  local_path TEXT,
  artifact_checksum TEXT,
  warm_state TEXT NOT NULL DEFAULT 'installed'
    CHECK (warm_state IN ('embedded', 'installed', 'remote_only')),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, skill_id, source_variant_key)
);

CREATE INDEX IF NOT EXISTS idx_skill_install_artifacts_org ON skill_install_artifacts(org_id);
CREATE INDEX IF NOT EXISTS idx_skill_catalog_source_type ON skill_catalog(source_type);
