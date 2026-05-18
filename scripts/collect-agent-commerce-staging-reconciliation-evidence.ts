import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  summarizeAgentCommerceStagingReconciliationEvidence,
} from '../src/lib/agent-commerce/staging-reconciliation-evidence'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const EventSchema = z.object({
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().optional(),
})

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function integerEnv(name: string, fallback?: number): number | undefined {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`)
  return value
}

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value)
}

function eventsFromFile(filePath: string) {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`Staging reconciliation events file does not exist: ${filePath}`)
  const parsed = JSON.parse(readFileSync(absolute, 'utf8'))
  const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
  const rawEvents = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsedRecord.events)
      ? parsedRecord.events
      : []
  return z.array(EventSchema).parse(rawEvents)
}

async function eventsFromSupabase(params: {
  orgId: string
  windowDays: number
  now: string
}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const now = new Date(params.now)
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - (params.windowDays - 1))
  start.setUTCHours(0, 0, 0, 0)

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase
    .from('agent_commerce_events')
    .select('event_type,payload,created_at')
    .eq('org_id', params.orgId)
    .eq('event_type', 'reconciliation.completed')
    .gte('created_at', start.toISOString())
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(integerEnv('AGENT_COMMERCE_STAGING_RECONCILIATION_LIMIT', 5000) ?? 5000)

  if (error) throw new Error(`Failed to read Agent Commerce reconciliation events: ${error.message}`)
  return z.array(EventSchema).parse(data ?? [])
}

async function main(): Promise<void> {
  const now = process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_NOW
    || new Date().toISOString()
  const windowDays = integerEnv('AGENT_COMMERCE_STAGING_RECONCILIATION_WINDOW_DAYS', 7) ?? 7
  const requiredRunDays = integerEnv(
    'AGENT_COMMERCE_STAGING_RECONCILIATION_REQUIRED_RUN_DAYS',
    windowDays,
  ) ?? windowDays
  const incidentCount = integerEnv('AGENT_COMMERCE_STAGING_RECONCILIATION_INCIDENT_COUNT')
  const eventsFile = process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVENTS_FILE?.trim()
  const orgId = process.env.AGENT_COMMERCE_STAGING_ORG_ID?.trim()

  const events = eventsFile
    ? eventsFromFile(eventsFile)
    : orgId
      ? await eventsFromSupabase({ orgId, windowDays, now })
      : (() => {
          throw new Error(
            'Set AGENT_COMMERCE_STAGING_RECONCILIATION_EVENTS_FILE or AGENT_COMMERCE_STAGING_ORG_ID.',
          )
        })()

  const summary = summarizeAgentCommerceStagingReconciliationEvidence({
    events,
    now,
    windowDays,
    requiredRunDays,
    untriagedP0P1IncidentCount: incidentCount,
  })

  const json = `${JSON.stringify(summary, null, 2)}\n`
  const output = process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_OUTPUT?.trim()
  if (output) {
    const absolute = absolutePath(output)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(absolute, json)
    console.error(`Wrote Agent Commerce staging reconciliation evidence to ${path.relative(repoRoot, absolute)}`)
  } else {
    process.stdout.write(json)
  }

  if (!summary.ready) {
    console.error('Agent Commerce staging reconciliation evidence is not ready yet:')
    console.error(`- missing evidence=${summary.missingEvidence.join(',') || 'none'}`)
  }

  if (truthy(process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_REQUIRE_READY) && !summary.ready) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
