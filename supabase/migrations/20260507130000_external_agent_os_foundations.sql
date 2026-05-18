-- External Agent OS foundations
-- Consolidates Paperclip/GStack/GBrain-inspired primitives into Lucid-native
-- Agent Ops, Mission Control, and Knowledge tables.

CREATE TABLE IF NOT EXISTS mission_control_system_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  notice_type TEXT NOT NULL CHECK (notice_type IN (
    'run_started',
    'run_completed',
    'run_failed',
    'run_blocked',
    'handoff_required',
    'planning_mode',
    'stale_context',
    'workspace_changed',
    'knowledge_claim_drift',
    'source_refresh_failed',
    'runtime_incompatible',
    'entitlement_fallback',
    'channel_report_ready',
    'l2_projection_failed',
    'eval_regression',
    'system_health'
  )),
  tone TEXT NOT NULL DEFAULT 'neutral' CHECK (tone IN ('neutral', 'info', 'success', 'warning', 'danger')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  channel_type TEXT,
  dedupe_key TEXT,
  metadata JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mission_control_system_notices_metadata_array CHECK (jsonb_typeof(metadata) = 'array'),
  CONSTRAINT mission_control_system_notices_actions_array CHECK (jsonb_typeof(actions) = 'array'),
  CONSTRAINT mission_control_system_notices_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_control_system_notices_dedupe
  ON mission_control_system_notices(org_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mission_control_system_notices_org_created
  ON mission_control_system_notices(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_control_system_notices_project_created
  ON mission_control_system_notices(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mission_control_system_notices_run
  ON mission_control_system_notices(run_id, created_at DESC)
  WHERE run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_ops_run_mode_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ops_run_id UUID NOT NULL REFERENCES agent_ops_runs(id) ON DELETE CASCADE,
  requested_mode TEXT NOT NULL CHECK (requested_mode IN ('plan_only', 'execute', 'review', 'qa', 'blocked', 'handoff')),
  effective_mode TEXT NOT NULL CHECK (effective_mode IN ('plan_only', 'execute', 'review', 'qa', 'blocked', 'handoff')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  allowed_mutations TEXT[] NOT NULL DEFAULT '{}'::text[],
  required_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  anti_shortcut_applied BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_ops_run_mode_events_required_questions_array CHECK (jsonb_typeof(required_questions) = 'array'),
  CONSTRAINT agent_ops_run_mode_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_run_mode_events_run
  ON agent_ops_run_mode_events(ops_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_run_mode_events_org
  ON agent_ops_run_mode_events(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  page_id UUID REFERENCES knowledge_pages(id) ON DELETE SET NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('fact', 'claim', 'hunch', 'bet', 'decision', 'risk', 'preference')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 240),
  claim TEXT NOT NULL CHECK (char_length(claim) BETWEEN 1 AND 8000),
  holder_type TEXT NOT NULL CHECK (holder_type IN ('world', 'operator', 'agent', 'team', 'source', 'system')),
  holder_id TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  weight NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (weight >= 0 AND weight <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'resolved', 'dismissed', 'archived')),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  resolved_outcome TEXT CHECK (resolved_outcome IN ('true', 'false', 'partial', 'obsolete', 'unknown')),
  resolved_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES knowledge_claims(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_claims_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_claims_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_claims_active_source_hash
  ON knowledge_claims(org_id, source_hash)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_org_status
  ON knowledge_claims(org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_project_status
  ON knowledge_claims(project_id, status, updated_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_team_status
  ON knowledge_claims(team_id, status, updated_at DESC)
  WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_source_status
  ON knowledge_claims(source_id, status)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_page_status
  ON knowledge_claims(page_id, status)
  WHERE page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'corrected', 'superseded', 'resolved', 'drift_flagged', 'dismissed', 'archived')),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 2000),
  patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_claim_events_patch_object CHECK (jsonb_typeof(patch) = 'object'),
  CONSTRAINT knowledge_claim_events_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT knowledge_claim_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_claim_events_claim
  ON knowledge_claim_events(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_claim_events_org
  ON knowledge_claim_events(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('run', 'channel_event', 'message', 'file', 'url', 'screenshot', 'transcript', 'diff', 'log', 'approval', 'l2_proof', 'commerce_event')),
  evidence_ref TEXT,
  artifact_id UUID REFERENCES agent_ops_artifacts(id) ON DELETE SET NULL,
  run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  url TEXT,
  label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_claim_evidence_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_claim_evidence_claim
  ON knowledge_claim_evidence(claim_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_ops_eval_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_ops_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('agent_ops_run', 'knowledge_think', 'browser_procedure', 'claim', 'manual')),
  source_id TEXT NOT NULL,
  task TEXT NOT NULL CHECK (char_length(task) BETWEEN 1 AND 4000),
  output_hash TEXT NOT NULL CHECK (char_length(output_hash) BETWEEN 16 AND 160),
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  judges JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'inconclusive')),
  aggregate JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_ops_eval_receipts_dimensions_array CHECK (jsonb_typeof(dimensions) = 'array'),
  CONSTRAINT agent_ops_eval_receipts_judges_array CHECK (jsonb_typeof(judges) = 'array'),
  CONSTRAINT agent_ops_eval_receipts_aggregate_object CHECK (jsonb_typeof(aggregate) = 'object'),
  CONSTRAINT agent_ops_eval_receipts_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_receipts_org
  ON agent_ops_eval_receipts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ops_eval_receipts_run
  ON agent_ops_eval_receipts(run_id, created_at DESC)
  WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_ops_eval_receipts_source_hash
  ON agent_ops_eval_receipts(org_id, source_type, source_id, output_hash);

CREATE TABLE IF NOT EXISTS knowledge_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('codex_session', 'claude_code_session', 'cursor_export', 'channel_transcript', 'browser_artifact', 'meeting_notes', 'repo_docs', 'manual_upload')),
  mode TEXT NOT NULL CHECK (mode IN ('probe', 'preview', 'commit', 'incremental')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'preview_ready', 'committed', 'failed', 'cancelled')),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  redaction_count INTEGER NOT NULL DEFAULT 0 CHECK (redaction_count >= 0),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_import_jobs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_import_jobs_org
  ON knowledge_import_jobs(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES knowledge_import_jobs(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'skipped', 'committed', 'failed')),
  content_hash TEXT NOT NULL,
  title TEXT,
  preview TEXT,
  redactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_import_items_redactions_array CHECK (jsonb_typeof(redactions) = 'array'),
  CONSTRAINT knowledge_import_items_output_refs_array CHECK (jsonb_typeof(output_refs) = 'array'),
  CONSTRAINT knowledge_import_items_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_import_items_job_key
  ON knowledge_import_items(import_job_id, item_key);

CREATE TABLE IF NOT EXISTS lucid_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 80),
  manifest JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lucid_packs_manifest_object CHECK (jsonb_typeof(manifest) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lucid_packs_key_version
  ON lucid_packs(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), pack_key, version);

CREATE TABLE IF NOT EXISTS lucid_pack_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES lucid_packs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  installed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lucid_pack_installs_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lucid_pack_installs_active
  ON lucid_pack_installs(org_id, project_id, pack_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS lucid_pack_managed_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  install_id UUID NOT NULL REFERENCES lucid_pack_installs(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('agent', 'team', 'workflow', 'routine', 'knowledge_source', 'browser_procedure', 'host_playbook', 'policy')),
  resource_id TEXT,
  management_policy TEXT NOT NULL DEFAULT 'managed' CHECK (management_policy IN ('managed', 'fork_on_edit', 'advisory')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drifted', 'forked', 'archived')),
  last_reconciled_at TIMESTAMPTZ,
  spec_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lucid_pack_managed_resources_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lucid_pack_managed_resources_key
  ON lucid_pack_managed_resources(install_id, resource_key);

CREATE TABLE IF NOT EXISTS knowledge_external_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  token_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_external_clients_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_external_clients_token_hash
  ON knowledge_external_clients(token_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_external_clients_org
  ON knowledge_external_clients(org_id, status, created_at DESC);

-- Keep run-mode state queryable on the run row without requiring a separate
-- join for the common Mission Control detail path.
ALTER TABLE agent_ops_runs
  ADD COLUMN IF NOT EXISTS run_mode TEXT NOT NULL DEFAULT 'execute'
    CHECK (run_mode IN ('plan_only', 'execute', 'review', 'qa', 'blocked', 'handoff'));

CREATE INDEX IF NOT EXISTS idx_agent_ops_runs_run_mode
  ON agent_ops_runs(org_id, run_mode, created_at DESC);

-- Updated-at triggers for mutable tables.
DROP TRIGGER IF EXISTS trg_knowledge_claims_updated_at ON knowledge_claims;
CREATE TRIGGER trg_knowledge_claims_updated_at
  BEFORE UPDATE ON knowledge_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_knowledge_import_jobs_updated_at ON knowledge_import_jobs;
CREATE TRIGGER trg_knowledge_import_jobs_updated_at
  BEFORE UPDATE ON knowledge_import_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lucid_packs_updated_at ON lucid_packs;
CREATE TRIGGER trg_lucid_packs_updated_at
  BEFORE UPDATE ON lucid_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lucid_pack_installs_updated_at ON lucid_pack_installs;
CREATE TRIGGER trg_lucid_pack_installs_updated_at
  BEFORE UPDATE ON lucid_pack_installs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lucid_pack_managed_resources_updated_at ON lucid_pack_managed_resources;
CREATE TRIGGER trg_lucid_pack_managed_resources_updated_at
  BEFORE UPDATE ON lucid_pack_managed_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_knowledge_external_clients_updated_at ON knowledge_external_clients;
CREATE TRIGGER trg_knowledge_external_clients_updated_at
  BEFORE UPDATE ON knowledge_external_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE mission_control_system_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ops_run_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_claim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ops_eval_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucid_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucid_pack_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucid_pack_managed_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_external_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY mission_control_system_notices_org_select ON mission_control_system_notices
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY agent_ops_run_mode_events_org_select ON agent_ops_run_mode_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_claims_org_select ON knowledge_claims
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_claim_events_org_select ON knowledge_claim_events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_claim_evidence_org_select ON knowledge_claim_evidence
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY agent_ops_eval_receipts_org_select ON agent_ops_eval_receipts
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_import_jobs_org_select ON knowledge_import_jobs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_import_items_org_select ON knowledge_import_items
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY lucid_packs_public_select ON lucid_packs
  FOR SELECT TO authenticated
  USING (org_id IS NULL OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY lucid_pack_installs_org_select ON lucid_pack_installs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY lucid_pack_managed_resources_org_select ON lucid_pack_managed_resources
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY knowledge_external_clients_org_select ON knowledge_external_clients
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY mission_control_system_notices_service_all ON mission_control_system_notices
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY agent_ops_run_mode_events_service_all ON agent_ops_run_mode_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_claims_service_all ON knowledge_claims
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_claim_events_service_all ON knowledge_claim_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_claim_evidence_service_all ON knowledge_claim_evidence
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY agent_ops_eval_receipts_service_all ON agent_ops_eval_receipts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_import_jobs_service_all ON knowledge_import_jobs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_import_items_service_all ON knowledge_import_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY lucid_packs_service_all ON lucid_packs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY lucid_pack_installs_service_all ON lucid_pack_installs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY lucid_pack_managed_resources_service_all ON lucid_pack_managed_resources
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY knowledge_external_clients_service_all ON knowledge_external_clients
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
