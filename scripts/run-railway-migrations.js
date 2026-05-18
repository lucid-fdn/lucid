const { Client } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL or RAILWAY_DATABASE_URL.')
  process.exit(1)
}

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS openmeter_event_ledger (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  org_id UUID NOT NULL,
  total_tokens INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  provider_name TEXT NOT NULL,
  model_family TEXT NOT NULL,
  status_bucket TEXT NOT NULL CHECK (status_bucket IN ('success', 'error', 'timeout')),
  service TEXT NOT NULL,
  feature TEXT NOT NULL,
  environment TEXT NOT NULL,
  trace_id TEXT,
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts <= 10),
  lease_until TIMESTAMPTZ,
  lease_owner TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_scan ON openmeter_event_ledger (created_at)
WHERE sent_at IS NULL AND attempts < 10;
CREATE INDEX IF NOT EXISTS idx_org_reporting ON openmeter_event_ledger (org_id, created_at DESC);
`

const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  policy JSONB NOT NULL,
  policy_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_passports_org ON passports (org_id);
CREATE INDEX IF NOT EXISTS idx_passports_status ON passports (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_passports_policy_hash ON passports (policy_hash);
`

const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS receipt_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  passport_id UUID REFERENCES passports(id),
  org_id UUID NOT NULL,
  model TEXT NOT NULL,
  resolved_provider TEXT,
  resolved_model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  request_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_receipt_events_status ON receipt_events (status, created_at)
WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_receipt_events_passport ON receipt_events (passport_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_events_org ON receipt_events (org_id, created_at DESC);
`

async function run() {
  const client = new Client(DATABASE_URL)
  try {
    await client.connect()
    console.log('Connected to Railway Postgres')

    console.log('\n--- Running Migration 001: OpenMeter Event Ledger ---')
    await client.query(MIGRATION_001)
    console.log('✅ Migration 001 complete')

    console.log('\n--- Running Migration 002: Passport Store ---')
    await client.query(MIGRATION_002)
    console.log('✅ Migration 002 complete')

    console.log('\n--- Running Migration 003: Receipt Events ---')
    await client.query(MIGRATION_003)
    console.log('✅ Migration 003 complete')

    // Verify tables exist
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('openmeter_event_ledger', 'passports', 'receipt_events')
      ORDER BY table_name
    `)
    console.log('\n--- Verification ---')
    console.log('Tables created:', result.rows.map(r => r.table_name).join(', '))
    console.log('\nAll migrations successful!')
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
