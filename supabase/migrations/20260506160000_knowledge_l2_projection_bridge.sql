-- Lucid Knowledge <-> Lucid-L2 verifiable memory bridge.
-- Local product recall remains the source of truth. This outbox projects safe
-- commitments/proofs to Lucid-L2 asynchronously after local writes succeed.

CREATE TABLE IF NOT EXISTS knowledge_l2_projection_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  team_id UUID REFERENCES crews(id) ON DELETE SET NULL,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  page_id UUID REFERENCES knowledge_pages(id) ON DELETE SET NULL,
  event_id UUID REFERENCES knowledge_events(id) ON DELETE SET NULL,

  local_resource_type TEXT NOT NULL CHECK (local_resource_type IN (
    'assistant_memory',
    'team_brain',
    'project_brain',
    'org_brain',
    'evidence',
    'run_receipt',
    'knowledge_page',
    'knowledge_event'
  )),
  local_resource_id TEXT NOT NULL CHECK (char_length(local_resource_id) BETWEEN 1 AND 200),
  projection_policy TEXT NOT NULL CHECK (projection_policy IN (
    'disabled',
    'commitment_only',
    'encrypted_payload',
    'public_payload'
  )),
  namespace TEXT NOT NULL CHECK (char_length(namespace) BETWEEN 1 AND 240),
  scoped_user_id TEXT,
  agent_passport_id TEXT,
  channel_type TEXT,
  channel_id TEXT,
  conversation_id TEXT,

  content_hash TEXT NOT NULL CHECK (char_length(content_hash) BETWEEN 16 AND 160),
  payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  encrypted_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'projecting',
    'projected',
    'failed',
    'skipped'
  )),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  projected_at TIMESTAMPTZ,

  CONSTRAINT knowledge_l2_outbox_payload_object CHECK (jsonb_typeof(payload_redacted) = 'object'),
  CONSTRAINT knowledge_l2_outbox_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT knowledge_l2_outbox_no_disabled_pending CHECK (
    projection_policy <> 'disabled' OR status IN ('skipped', 'failed')
  )
);

CREATE TABLE IF NOT EXISTS knowledge_l2_projection_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outbox_id UUID NOT NULL REFERENCES knowledge_l2_projection_outbox(id) ON DELETE CASCADE,
  local_resource_type TEXT NOT NULL,
  local_resource_id TEXT NOT NULL,
  agent_passport_id TEXT,
  namespace TEXT NOT NULL,
  l2_memory_id TEXT,
  content_hash TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  snapshot_cid TEXT,
  anchor_epoch_id TEXT,
  anchor_tx_hash TEXT,
  anchor_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (anchor_status IN ('pending', 'anchored', 'verified', 'failed')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'failed')),
  verification_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_l2_receipts_payload_object CHECK (jsonb_typeof(verification_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_l2_outbox_local_hash
  ON knowledge_l2_projection_outbox(org_id, local_resource_type, local_resource_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_l2_outbox_pending
  ON knowledge_l2_projection_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_knowledge_l2_outbox_org_created
  ON knowledge_l2_projection_outbox(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_l2_receipts_org_created
  ON knowledge_l2_projection_receipts(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_l2_receipts_local
  ON knowledge_l2_projection_receipts(org_id, local_resource_type, local_resource_id);

DROP TRIGGER IF EXISTS trg_knowledge_l2_outbox_updated_at ON knowledge_l2_projection_outbox;
CREATE TRIGGER trg_knowledge_l2_outbox_updated_at
  BEFORE UPDATE ON knowledge_l2_projection_outbox
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_l2_receipts_updated_at ON knowledge_l2_projection_receipts;
CREATE TRIGGER trg_knowledge_l2_receipts_updated_at
  BEFORE UPDATE ON knowledge_l2_projection_receipts
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

ALTER TABLE knowledge_l2_projection_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_l2_projection_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_l2_outbox_org_select ON knowledge_l2_projection_outbox
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_l2_receipts_org_select ON knowledge_l2_projection_receipts
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY knowledge_l2_outbox_service_all ON knowledge_l2_projection_outbox
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY knowledge_l2_receipts_service_all ON knowledge_l2_projection_receipts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
