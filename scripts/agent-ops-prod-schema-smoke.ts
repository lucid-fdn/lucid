#!/usr/bin/env tsx
import 'dotenv/config'

type RequiredAgentOpsTable = {
  table: string
  migration: string
  purpose: string
}

const REQUIRED_TABLES: RequiredAgentOpsTable[] = [
  {
    table: 'agent_ops_runs',
    migration: '20260428100000_agent_ops_foundation.sql',
    purpose: 'Agent Ops run records',
  },
  {
    table: 'agent_ops_artifacts',
    migration: '20260428100000_agent_ops_foundation.sql',
    purpose: 'Mission Control evidence artifacts',
  },
  {
    table: 'agent_ops_findings',
    migration: '20260428100000_agent_ops_foundation.sql',
    purpose: 'Mission Control findings',
  },
  {
    table: 'agent_ops_browser_qa_sessions',
    migration: '20260428110000_agent_ops_browser_qa_sessions.sql',
    purpose: 'Browser Operator session summaries',
  },
  {
    table: 'agent_ops_browser_session_events',
    migration: '20260502130000_agent_ops_browser_session_events.sql',
    purpose: 'Browser Operator live timeline events',
  },
  {
    table: 'agent_ops_browser_session_shares',
    migration: '20260502140000_agent_ops_browser_session_sharing.sql',
    purpose: 'Browser Operator shared-session grants',
  },
  {
    table: 'agent_ops_browser_session_actions',
    migration: '20260502140000_agent_ops_browser_session_sharing.sql',
    purpose: 'Browser Operator shared-session action audit trail',
  },
]

const TABLE_CHECK_TIMEOUT_MS = readPositiveInt(process.env.AGENT_OPS_SCHEMA_SMOKE_TIMEOUT_MS, 10_000)

type SmokeResult = RequiredAgentOpsTable & {
  ok: boolean
  status?: number
  code?: string
  message?: string
}

async function main(): Promise<number> {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    return 1
  }

  const results = await Promise.all(REQUIRED_TABLES.map((table) => checkTable({
    ...table,
    supabaseUrl,
    serviceRoleKey,
  })))

  for (const result of results) {
    const status = result.ok ? 'ok' : 'missing'
    console.log(`${status.padEnd(7)} ${result.table} - ${result.purpose}`)
    if (!result.ok) {
      console.log(`        migration: ${result.migration}`)
      console.log(`        ${result.code ?? result.status ?? 'unknown'} ${result.message ?? ''}`.trimEnd())
    }
  }

  const missing = results.filter((result) => !result.ok)
  if (missing.length > 0) {
    console.error('')
    console.error('Agent Ops production schema smoke failed.')
    console.error('Apply the listed migrations to the target Supabase project before claiming Browser Operator parity.')
    return 1
  }

  console.log('')
  console.log('Agent Ops production schema smoke passed.')
  return 0
}

async function checkTable(input: RequiredAgentOpsTable & {
  supabaseUrl: string
  serviceRoleKey: string
}): Promise<SmokeResult> {
  const response = await fetch(`${input.supabaseUrl}/rest/v1/${input.table}?select=id&limit=1`, {
    signal: AbortSignal.timeout(TABLE_CHECK_TIMEOUT_MS),
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      accept: 'application/json',
    },
  })

  if (response.ok) return { ...input, ok: true }

  const body = await safeJson(response)
  return {
    ...input,
    ok: false,
    status: response.status,
    code: typeof body?.code === 'string' ? body.code : undefined,
    message: typeof body?.message === 'string' ? body.message : response.statusText,
  }
}

function normalizeSupabaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
