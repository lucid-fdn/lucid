-- Runtime capability plane
-- Stores the last engine/adapter capability report for managed and BYO runtimes.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS adapter_identity JSONB,
  ADD COLUMN IF NOT EXISTS native_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS adapter_probe_result JSONB,
  ADD COLUMN IF NOT EXISTS transcript_parser_status JSONB,
  ADD COLUMN IF NOT EXISTS runtime_command_spec JSONB,
  ADD COLUMN IF NOT EXISTS engine_home_policy JSONB,
  ADD COLUMN IF NOT EXISTS capability_reported_at TIMESTAMPTZ;

COMMENT ON COLUMN dedicated_runtimes.adapter_identity IS
  'Latest adapter identity reported by heartbeat; sanitized before client display for Lucid-managed runtimes.';
COMMENT ON COLUMN dedicated_runtimes.native_capabilities IS
  'Latest runtime-native capability report using contracts/runtime-capability.ts.';
COMMENT ON COLUMN dedicated_runtimes.runtime_services IS
  'Latest runtime service inventory. Managed runtimes expose Lucid-branded status only.';
COMMENT ON COLUMN dedicated_runtimes.adapter_probe_result IS
  'Latest cached adapter environment/probe summary.';
COMMENT ON COLUMN dedicated_runtimes.transcript_parser_status IS
  'Latest adapter transcript parser support/test status.';
COMMENT ON COLUMN dedicated_runtimes.runtime_command_spec IS
  'Runtime command specification for BYO/local authoring; never stores secrets.';
COMMENT ON COLUMN dedicated_runtimes.engine_home_policy IS
  'Engine Home Virtualization/native-home authority and write policy.';
COMMENT ON COLUMN dedicated_runtimes.capability_reported_at IS
  'Timestamp of latest capability report accepted from heartbeat/API.';

CREATE INDEX IF NOT EXISTS idx_dedicated_runtimes_capability_reported_at
  ON dedicated_runtimes (org_id, capability_reported_at DESC)
  WHERE capability_reported_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dedicated_runtimes_native_capabilities_gin
  ON dedicated_runtimes USING GIN (native_capabilities);

CREATE TABLE IF NOT EXISTS runtime_management_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runtime_id UUID NOT NULL REFERENCES dedicated_runtimes(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  target_capability_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'accepted', 'rejected', 'needs_user_action', 'applied', 'failed', 'expired')),
  response JSONB,
  error TEXT,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

COMMENT ON TABLE runtime_management_commands IS
  'Engine-agnostic management command queue. BYO runtimes may accept, reject, or require user action.';

CREATE INDEX IF NOT EXISTS idx_runtime_management_commands_runtime_status
  ON runtime_management_commands (runtime_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_management_commands_org_time
  ON runtime_management_commands (org_id, requested_at DESC);

ALTER TABLE runtime_management_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY runtime_management_commands_org_select
  ON runtime_management_commands FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY runtime_management_commands_org_insert
  ON runtime_management_commands FOR INSERT
  WITH CHECK (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY runtime_management_commands_org_update
  ON runtime_management_commands FOR UPDATE
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY runtime_management_commands_service_all
  ON runtime_management_commands FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
