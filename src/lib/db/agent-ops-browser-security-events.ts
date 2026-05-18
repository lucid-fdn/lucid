import 'server-only'

import {
  browserTrustSecurityEventSchema,
  type AgentOpsBrowserTrustSecurityEvent,
} from '@/lib/agent-ops/browser-trust-shield'
import { ErrorService, supabase } from './client'

type BrowserSecurityEventRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string | null
  browser_session_id: string | null
  event_type: AgentOpsBrowserTrustSecurityEvent['eventType']
  severity: AgentOpsBrowserTrustSecurityEvent['severity']
  layer: AgentOpsBrowserTrustSecurityEvent['layer']
  host: string | null
  url_hash: string | null
  content_hash: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const BROWSER_SECURITY_EVENT_SELECT = `
  id,
  org_id,
  project_id,
  ops_run_id,
  browser_session_id,
  event_type,
  severity,
  layer,
  host,
  url_hash,
  content_hash,
  details,
  created_at
`

export async function recordAgentOpsBrowserSecurityEvent(
  input: AgentOpsBrowserTrustSecurityEvent,
): Promise<AgentOpsBrowserTrustSecurityEvent | null> {
  const parsed = browserTrustSecurityEventSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_ops_browser_security_events')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      ops_run_id: parsed.opsRunId ?? null,
      browser_session_id: parsed.browserSessionId ?? null,
      event_type: parsed.eventType,
      severity: parsed.severity,
      layer: parsed.layer,
      host: parsed.host ?? null,
      url_hash: parsed.urlHash ?? null,
      content_hash: parsed.contentHash ?? null,
      details: parsed.details,
    })
    .select(BROWSER_SECURITY_EVENT_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: parsed.orgId, operation: 'recordAgentOpsBrowserSecurityEvent' },
      tags: { layer: 'database', table: 'agent_ops_browser_security_events' },
    })
    return null
  }

  return mapBrowserSecurityEventRow(data as BrowserSecurityEventRow)
}

export async function listAgentOpsBrowserSecurityEvents(input: {
  orgId: string
  projectId?: string | null
  opsRunId?: string | null
  limit?: number
}): Promise<AgentOpsBrowserTrustSecurityEvent[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('agent_ops_browser_security_events')
    .select(BROWSER_SECURITY_EVENT_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.opsRunId) query = query.eq('ops_run_id', input.opsRunId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listAgentOpsBrowserSecurityEvents' },
      tags: { layer: 'database', table: 'agent_ops_browser_security_events' },
    })
    return []
  }

  return ((data ?? []) as BrowserSecurityEventRow[]).map(mapBrowserSecurityEventRow)
}

function mapBrowserSecurityEventRow(row: BrowserSecurityEventRow): AgentOpsBrowserTrustSecurityEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    opsRunId: row.ops_run_id,
    browserSessionId: row.browser_session_id,
    eventType: row.event_type,
    severity: row.severity,
    layer: row.layer,
    host: row.host,
    urlHash: row.url_hash,
    contentHash: row.content_hash,
    details: row.details ?? {},
    createdAt: row.created_at,
  }
}
