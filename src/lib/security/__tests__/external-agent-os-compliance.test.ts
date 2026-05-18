import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

function readMigration(file: string): string {
  return fs.readFileSync(path.join(repoRoot, 'supabase/migrations', file), 'utf8')
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase()
}

describe('External Agent OS security and compliance migrations', () => {
  it('enables RLS and service-role policies for new Agent OS tables', () => {
    const migration = readMigration('20260507130000_external_agent_os_foundations.sql')
    const tables = [
      'mission_control_system_notices',
      'agent_ops_run_mode_events',
      'knowledge_claims',
      'knowledge_claim_events',
      'knowledge_claim_evidence',
      'agent_ops_eval_receipts',
      'knowledge_import_jobs',
      'knowledge_import_items',
      'lucid_packs',
      'lucid_pack_installs',
      'lucid_pack_managed_resources',
    ]

    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`CREATE POLICY ${table}_service_all ON ${table}`)
    }
  })

  it('keeps identity, heartbeat, and shared context tables behind org-scoped RLS', () => {
    const identityMigration = readMigration('20260507110000_agent_identity_documents.sql')
    const contextMigration = readMigration('20260507111000_shared_context_records.sql')
    const identitySql = normalizeSql(identityMigration)
    const contextSql = normalizeSql(contextMigration)

    expect(identitySql).toContain('alter table public.agent_identity_documents enable row level security')
    expect(identitySql).toContain('create policy agent_identity_documents_select_member')
    expect(identitySql).toContain('create policy agent_identity_documents_service_all')

    for (const table of ['shared_context_records', 'shared_context_links', 'daily_intel_runs', 'agent_heartbeats']) {
      expect(contextSql).toContain(`alter table public.${table} enable row level security`)
      expect(contextSql).toContain(`create policy ${table}_service_all`)
    }
  })

  it('tracks revocation and scoped permissions for external Knowledge clients', () => {
    const migration = readMigration('20260507130000_external_agent_os_foundations.sql')

    expect(migration).toContain('knowledge_external_clients')
    expect(migration).toContain('revoked_at TIMESTAMPTZ')
    expect(migration).toContain("scopes TEXT[] NOT NULL DEFAULT '{}'::text[]")
    expect(migration).toContain('CREATE POLICY knowledge_external_clients_org_select ON knowledge_external_clients')
    expect(migration).toContain('CREATE POLICY knowledge_external_clients_service_all ON knowledge_external_clients')
  })
})
