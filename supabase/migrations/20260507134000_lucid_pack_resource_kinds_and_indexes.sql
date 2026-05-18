ALTER TABLE lucid_pack_managed_resources
  DROP CONSTRAINT IF EXISTS lucid_pack_managed_resources_resource_kind_check;

ALTER TABLE lucid_pack_managed_resources
  ADD CONSTRAINT lucid_pack_managed_resources_resource_kind_check
  CHECK (resource_kind IN (
    'agent',
    'team',
    'workflow',
    'routine',
    'knowledge_source',
    'browser_procedure',
    'host_playbook',
    'skill',
    'doc',
    'policy',
    'channel_command'
  ));

CREATE INDEX IF NOT EXISTS idx_lucid_pack_managed_resources_org_status
  ON lucid_pack_managed_resources(org_id, status, updated_at DESC);
