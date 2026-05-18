-- Migration 107: Agent Commerce foundation
-- Provider-neutral ledger, idempotency, machine-payment proof claims, and audit events.

CREATE TABLE IF NOT EXISTS agent_commerce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  provider_connection_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked', 'expired', 'disabled', 'failed')),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_connections_org_provider
  ON agent_commerce_connections (org_id, provider, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commerce_connections_provider_connection
  ON agent_commerce_connections (provider, provider_connection_id)
  WHERE provider_connection_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_commerce_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('org', 'project', 'assistant', 'user', 'seller_endpoint', 'generated_app')),
  scope_id UUID,
  policy JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_policies_scope
  ON agent_commerce_policies (org_id, scope_type, scope_id, is_active);

CREATE TABLE IF NOT EXISTS agent_spend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  provider_version TEXT,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID,
  assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  run_id TEXT,
  tool_call_id TEXT,
  idempotency_key TEXT,
  provider TEXT NOT NULL,
  rail TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'requires_connection', 'requires_approval', 'approved', 'credential_issuing', 'credential_issued', 'completed', 'declined', 'expired', 'failed', 'cancelled')),
  merchant JSONB NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  context TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  router_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_request_id TEXT,
  provider_credential_id TEXT,
  credential_kind TEXT,
  approval_required BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_spend_requests_org_idempotency
  ON agent_spend_requests (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_spend_requests_provider_request
  ON agent_spend_requests (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_spend_requests_org_status
  ON agent_spend_requests (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_spend_requests_assistant_run
  ON agent_spend_requests (assistant_id, run_id)
  WHERE assistant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_commerce_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_request_id UUID NOT NULL REFERENCES agent_spend_requests(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('pending', 'issued', 'revoked', 'expired', 'failed')),
  secret_ref TEXT,
  display JSONB,
  usage_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_credentials_spend_request
  ON agent_commerce_credentials (spend_request_id);

CREATE TABLE IF NOT EXISTS seller_payment_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  rail TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'validating', 'accepted', 'processing', 'completed', 'rejected', 'revoked', 'expired', 'failed')),
  customer_reference TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  usage_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_payment_id TEXT,
  entitlement_ref TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_payment_grants_provider_grant
  ON seller_payment_grants (provider, grant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_payment_grants_provider_payment
  ON seller_payment_grants (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_payment_grants_org_status
  ON seller_payment_grants (org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS machine_payment_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  rail TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  challenge_hash TEXT NOT NULL,
  challenge_body JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'challenge_created'
    CHECK (status IN ('challenge_created', 'proof_claimed', 'settlement_pending', 'settled', 'expired', 'failed', 'refunded')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_machine_payment_challenges_hash
  ON machine_payment_challenges (provider, challenge_hash);

CREATE INDEX IF NOT EXISTS idx_machine_payment_challenges_org_resource
  ON machine_payment_challenges (org_id, resource_type, resource_id, status);

CREATE TABLE IF NOT EXISTS machine_payment_proof_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES machine_payment_challenges(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  proof_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proof_claimed'
    CHECK (status IN ('challenge_created', 'proof_claimed', 'settlement_pending', 'settled', 'expired', 'failed', 'refunded')),
  provider_payment_id TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_machine_payment_proof_claims_provider_hash
  ON machine_payment_proof_claims (provider, proof_hash);

CREATE INDEX IF NOT EXISTS idx_machine_payment_proof_claims_challenge
  ON machine_payment_proof_claims (challenge_id);

CREATE TABLE IF NOT EXISTS agent_commerce_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL DEFAULT '2026-05-01',
  schema_version INTEGER NOT NULL DEFAULT 1,
  stack_id TEXT NOT NULL DEFAULT 'commerce' CHECK (stack_id = 'commerce'),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  provider TEXT,
  provider_event_id TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('user', 'agent', 'runtime', 'provider', 'system')),
  actor_id TEXT,
  request_id TEXT,
  run_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commerce_events_provider_event
  ON agent_commerce_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_commerce_events_entity
  ON agent_commerce_events (org_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commerce_events_org_created
  ON agent_commerce_events (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_commerce_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commerce_idempotency_unique
  ON agent_commerce_idempotency_keys (org_id, operation, idempotency_key);

CREATE TABLE IF NOT EXISTS agent_commerce_provider_health (
  provider TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (mode IN ('live', 'preview', 'waitlist', 'disabled')),
  status TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('healthy', 'degraded', 'disabled')),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_commerce_connections',
    'agent_commerce_policies',
    'agent_spend_requests',
    'agent_commerce_credentials',
    'seller_payment_grants',
    'machine_payment_challenges',
    'machine_payment_proof_claims',
    'agent_commerce_events',
    'agent_commerce_idempotency_keys',
    'agent_commerce_provider_health'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_commerce_connections',
    'agent_commerce_policies',
    'agent_spend_requests',
    'agent_commerce_credentials',
    'seller_payment_grants',
    'machine_payment_challenges',
    'machine_payment_proof_claims',
    'agent_commerce_events',
    'agent_commerce_idempotency_keys'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can view org agent commerce rows" ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY "Users can view org agent commerce rows" ON %I FOR SELECT USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))',
      table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS "Service role manages agent commerce rows" ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY "Service role manages agent commerce rows" ON %I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Users can view provider health" ON agent_commerce_provider_health;
CREATE POLICY "Users can view provider health"
  ON agent_commerce_provider_health FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role manages provider health" ON agent_commerce_provider_health;
CREATE POLICY "Service role manages provider health"
  ON agent_commerce_provider_health FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION claim_agent_commerce_idempotency_key(
  p_org_id UUID,
  p_operation TEXT,
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours'
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  entity_type TEXT,
  entity_id UUID,
  request_hash TEXT,
  first_seen BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO agent_commerce_idempotency_keys (
    org_id,
    operation,
    idempotency_key,
    request_hash,
    expires_at
  )
  VALUES (
    p_org_id,
    p_operation,
    p_idempotency_key,
    p_request_hash,
    p_expires_at
  )
  ON CONFLICT (org_id, operation, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY
  SELECT
    k.id,
    k.status,
    k.entity_type,
    k.entity_id,
    k.request_hash,
    (v_inserted = 1) AS first_seen
  FROM agent_commerce_idempotency_keys k
  WHERE k.org_id = p_org_id
    AND k.operation = p_operation
    AND k.idempotency_key = p_idempotency_key
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION complete_agent_commerce_idempotency_key(
  p_org_id UUID,
  p_operation TEXT,
  p_idempotency_key TEXT,
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE agent_commerce_idempotency_keys
  SET status = 'completed',
      entity_type = p_entity_type,
      entity_id = p_entity_id
  WHERE org_id = p_org_id
    AND operation = p_operation
    AND idempotency_key = p_idempotency_key;
$$;

CREATE OR REPLACE FUNCTION claim_machine_payment_proof(
  p_challenge_id UUID,
  p_org_id UUID,
  p_provider TEXT,
  p_proof_hash TEXT,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  challenge_id UUID,
  org_id UUID,
  provider TEXT,
  proof_hash TEXT,
  status TEXT,
  provider_payment_id TEXT,
  claimed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  metadata JSONB,
  first_claim BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO machine_payment_proof_claims (
    challenge_id,
    org_id,
    provider,
    proof_hash,
    provider_payment_id,
    metadata
  )
  VALUES (
    p_challenge_id,
    p_org_id,
    p_provider,
    p_proof_hash,
    p_provider_payment_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (provider, proof_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE machine_payment_challenges
  SET status = 'proof_claimed'
  WHERE id = p_challenge_id
    AND org_id = p_org_id
    AND status = 'challenge_created'
    AND expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM machine_payment_proof_claims c
      WHERE c.challenge_id = p_challenge_id
        AND c.provider = p_provider
        AND c.proof_hash = p_proof_hash
    );

  RETURN QUERY
  SELECT
    c.id,
    c.challenge_id,
    c.org_id,
    c.provider,
    c.proof_hash,
    c.status,
    c.provider_payment_id,
    c.claimed_at,
    c.settled_at,
    c.metadata,
    (v_inserted = 1) AS first_claim
  FROM machine_payment_proof_claims c
  WHERE c.provider = p_provider
    AND c.proof_hash = p_proof_hash
  FOR UPDATE;
END;
$$;
