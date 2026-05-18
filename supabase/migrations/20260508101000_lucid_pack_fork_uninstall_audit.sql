ALTER TABLE lucid_pack_managed_resources
  ADD COLUMN IF NOT EXISTS forked_from_resource_id UUID REFERENCES lucid_pack_managed_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fork_reason TEXT,
  ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uninstall_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_lucid_pack_managed_resources_forked_from
  ON lucid_pack_managed_resources(org_id, forked_from_resource_id)
  WHERE forked_from_resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lucid_pack_managed_resources_uninstalled
  ON lucid_pack_managed_resources(org_id, uninstalled_at DESC)
  WHERE uninstalled_at IS NOT NULL;
