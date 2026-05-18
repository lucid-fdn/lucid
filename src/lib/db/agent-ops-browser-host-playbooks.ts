import 'server-only'

import {
  createBrowserHostPlaybookInputSchema,
  listBrowserHostPlaybooksInputSchema,
  rankBrowserHostPlaybookMatches,
  type AgentOpsBrowserHostPlaybook,
  type CreateBrowserHostPlaybookInput,
  type ListBrowserHostPlaybooksInput,
} from '@/lib/agent-ops/browser-host-playbooks'
import { ErrorService, supabase } from './client'

type BrowserHostPlaybookRow = {
  id: string
  org_id: string
  project_id: string | null
  host_pattern: string
  title: string
  body_md: string
  scope: AgentOpsBrowserHostPlaybook['scope']
  trust_state: AgentOpsBrowserHostPlaybook['trustState']
  successful_uses: number
  security_flags_count: number
  last_used_at: string | null
  source_run_id: string | null
  created_by_user_id: string | null
  created_by_agent_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const BROWSER_HOST_PLAYBOOK_SELECT = `
  id,
  org_id,
  project_id,
  host_pattern,
  title,
  body_md,
  scope,
  trust_state,
  successful_uses,
  security_flags_count,
  last_used_at,
  source_run_id,
  created_by_user_id,
  created_by_agent_id,
  metadata,
  created_at,
  updated_at
`

export async function createAgentOpsBrowserHostPlaybook(
  input: CreateBrowserHostPlaybookInput,
): Promise<AgentOpsBrowserHostPlaybook> {
  const parsed = createBrowserHostPlaybookInputSchema.parse(input)

  const { data, error } = await supabase
    .from('agent_ops_browser_host_playbooks')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      host_pattern: parsed.hostPattern,
      title: parsed.title,
      body_md: parsed.bodyMd,
      scope: parsed.scope,
      trust_state: parsed.trustState,
      source_run_id: parsed.sourceRunId ?? null,
      created_by_user_id: parsed.createdByUserId ?? null,
      created_by_agent_id: parsed.createdByAgentId ?? null,
      metadata: parsed.metadata,
    })
    .select(BROWSER_HOST_PLAYBOOK_SELECT)
    .single()

  if (error) {
    captureBrowserHostPlaybookDbError(error, 'createAgentOpsBrowserHostPlaybook', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
      hostPattern: parsed.hostPattern,
    })
    throw error
  }

  return mapBrowserHostPlaybookRow(data as BrowserHostPlaybookRow)
}

export async function getAgentOpsBrowserHostPlaybook(input: {
  orgId: string
  playbookId: string
}): Promise<AgentOpsBrowserHostPlaybook | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_host_playbooks')
    .select(BROWSER_HOST_PLAYBOOK_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.playbookId)
    .maybeSingle()

  if (error) {
    captureBrowserHostPlaybookDbError(error, 'getAgentOpsBrowserHostPlaybook', input)
    throw error
  }

  return data ? mapBrowserHostPlaybookRow(data as BrowserHostPlaybookRow) : null
}

export async function listAgentOpsBrowserHostPlaybooks(
  input: ListBrowserHostPlaybooksInput,
): Promise<AgentOpsBrowserHostPlaybook[]> {
  const parsed = listBrowserHostPlaybooksInputSchema.parse(input)
  let query = supabase
    .from('agent_ops_browser_host_playbooks')
    .select(BROWSER_HOST_PLAYBOOK_SELECT)
    .eq('org_id', parsed.orgId)
    .order('updated_at', { ascending: false })
    .limit(parsed.limit)

  if (parsed.projectId !== undefined) {
    if (parsed.projectId === null) {
      query = query.is('project_id', null)
    } else {
      query = query.or(`project_id.eq.${parsed.projectId},project_id.is.null`)
    }
  }

  if (parsed.trustStates?.length) {
    query = query.in('trust_state', parsed.trustStates)
  }

  const { data, error } = await query
  if (error) {
    captureBrowserHostPlaybookDbError(error, 'listAgentOpsBrowserHostPlaybooks', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
    })
    throw error
  }

  const playbooks = ((data ?? []) as BrowserHostPlaybookRow[]).map(mapBrowserHostPlaybookRow)
  if (!parsed.host) return playbooks
  return rankBrowserHostPlaybookMatches(playbooks, { host: parsed.host }).map((match) => match.playbook)
}

export async function updateAgentOpsBrowserHostPlaybookTrustState(input: {
  orgId: string
  playbookId: string
  trustState: AgentOpsBrowserHostPlaybook['trustState']
  metadata?: Record<string, unknown>
}): Promise<AgentOpsBrowserHostPlaybook> {
  const { data, error } = await supabase
    .from('agent_ops_browser_host_playbooks')
    .update({
      trust_state: input.trustState,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    .eq('org_id', input.orgId)
    .eq('id', input.playbookId)
    .select(BROWSER_HOST_PLAYBOOK_SELECT)
    .single()

  if (error) {
    captureBrowserHostPlaybookDbError(error, 'updateAgentOpsBrowserHostPlaybookTrustState', input)
    throw error
  }

  return mapBrowserHostPlaybookRow(data as BrowserHostPlaybookRow)
}

export async function recordAgentOpsBrowserHostPlaybookUse(input: {
  playbookId: string
  success?: boolean
  securityFlagsCount?: number
}): Promise<void> {
  const { error } = await supabase.rpc('record_agent_ops_browser_host_playbook_use', {
    p_playbook_id: input.playbookId,
    p_success: input.success ?? true,
    p_security_flags_count: Math.max(0, input.securityFlagsCount ?? 0),
  })

  if (error) {
    captureBrowserHostPlaybookDbError(error, 'recordAgentOpsBrowserHostPlaybookUse', {
      playbookId: input.playbookId,
    })
    throw error
  }
}

function mapBrowserHostPlaybookRow(row: BrowserHostPlaybookRow): AgentOpsBrowserHostPlaybook {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    hostPattern: row.host_pattern,
    title: row.title,
    bodyMd: row.body_md,
    scope: row.scope,
    trustState: row.trust_state,
    successfulUses: row.successful_uses,
    securityFlagsCount: row.security_flags_count,
    lastUsedAt: row.last_used_at,
    sourceRunId: row.source_run_id,
    createdByUserId: row.created_by_user_id,
    createdByAgentId: row.created_by_agent_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function captureBrowserHostPlaybookDbError(
  error: unknown,
  operation: string,
  context: Record<string, unknown>,
) {
  ErrorService.captureException(error, {
    severity: 'error',
    context: {
      operation,
      ...context,
    },
    tags: {
      layer: 'database',
      domain: 'agent_ops_browser_host_playbooks',
    },
  })
}
