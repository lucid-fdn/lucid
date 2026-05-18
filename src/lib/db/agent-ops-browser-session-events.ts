import 'server-only'

import {
  browserSessionEventSchema,
  type AgentOpsBrowserSessionEvent,
} from '@/lib/agent-ops/browser-live-sessions'
import { ErrorService, supabase } from './client'

const BROWSER_SESSION_EVENTS_MIGRATION = '20260502130000_agent_ops_browser_session_events.sql'

type BrowserSessionEventRow = {
  id: string
  org_id: string
  ops_run_id: string
  browser_session_id: string | null
  session_key: string
  event_type: AgentOpsBrowserSessionEvent['eventType']
  severity: AgentOpsBrowserSessionEvent['severity']
  handoff_state: AgentOpsBrowserSessionEvent['handoffState']
  current_url: string | null
  artifact_id: string | null
  screenshot_uri: string | null
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const BROWSER_SESSION_EVENT_SELECT = `
  id,
  org_id,
  ops_run_id,
  browser_session_id,
  session_key,
  event_type,
  severity,
  handoff_state,
  current_url,
  artifact_id,
  screenshot_uri,
  message,
  metadata,
  created_at
`

export async function recordAgentOpsBrowserSessionEvent(
  input: AgentOpsBrowserSessionEvent,
): Promise<AgentOpsBrowserSessionEvent | null> {
  const parsed = browserSessionEventSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_ops_browser_session_events')
    .insert({
      org_id: parsed.orgId,
      ops_run_id: parsed.runId,
      browser_session_id: parsed.browserSessionId ?? null,
      session_key: parsed.sessionKey,
      event_type: parsed.eventType,
      severity: parsed.severity,
      handoff_state: parsed.handoffState ?? null,
      current_url: parsed.currentUrl ?? null,
      artifact_id: parsed.artifactId ?? null,
      screenshot_uri: parsed.screenshotUri ?? null,
      message: parsed.message ?? null,
      metadata: parsed.metadata,
    })
    .select(BROWSER_SESSION_EVENT_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: parsed.orgId,
        operation: 'recordAgentOpsBrowserSessionEvent',
        requiredMigration: isSchemaCacheMiss(error) ? BROWSER_SESSION_EVENTS_MIGRATION : undefined,
      },
      tags: { layer: 'database', table: 'agent_ops_browser_session_events' },
    })
    return null
  }

  return mapBrowserSessionEventRow(data as BrowserSessionEventRow)
}

export async function listAgentOpsBrowserSessionEventsForRun(
  orgId: string,
  runId: string,
  limit = 100,
): Promise<AgentOpsBrowserSessionEvent[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 300)
  const { data, error } = await supabase
    .from('agent_ops_browser_session_events')
    .select(BROWSER_SESSION_EVENT_SELECT)
    .eq('org_id', orgId)
    .eq('ops_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId,
        runId,
        operation: 'listAgentOpsBrowserSessionEventsForRun',
        requiredMigration: isSchemaCacheMiss(error) ? BROWSER_SESSION_EVENTS_MIGRATION : undefined,
      },
      tags: { layer: 'database', table: 'agent_ops_browser_session_events' },
    })
    return []
  }

  return ((data ?? []) as BrowserSessionEventRow[]).map(mapBrowserSessionEventRow)
}

export async function listAgentOpsBrowserSessionEvents(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  limit?: number
}): Promise<AgentOpsBrowserSessionEvent[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('agent_ops_browser_session_events')
    .select(`${BROWSER_SESSION_EVENT_SELECT}, agent_ops_runs!inner(project_id)`)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (input.runId) query = query.eq('ops_run_id', input.runId)
  if (input.projectId) query = query.eq('agent_ops_runs.project_id', input.projectId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        operation: 'listAgentOpsBrowserSessionEvents',
        requiredMigration: isSchemaCacheMiss(error) ? BROWSER_SESSION_EVENTS_MIGRATION : undefined,
      },
      tags: { layer: 'database', table: 'agent_ops_browser_session_events' },
    })
    return []
  }

  return ((data ?? []) as BrowserSessionEventRow[]).map(mapBrowserSessionEventRow)
}

function isSchemaCacheMiss(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST205'
  )
}

function mapBrowserSessionEventRow(row: BrowserSessionEventRow): AgentOpsBrowserSessionEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.ops_run_id,
    browserSessionId: row.browser_session_id,
    sessionKey: row.session_key,
    eventType: row.event_type,
    severity: row.severity,
    handoffState: row.handoff_state,
    currentUrl: row.current_url,
    artifactId: row.artifact_id,
    screenshotUri: row.screenshot_uri,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}
