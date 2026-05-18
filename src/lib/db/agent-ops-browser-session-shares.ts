import 'server-only'

import {
  browserSessionShareSchema,
  browserSessionSharedActionSchema,
  buildBrowserSessionTabIdentity,
  createBrowserSessionShareSecret,
  hashBrowserSessionShareToken,
  type AgentOpsBrowserSessionShare,
  type AgentOpsBrowserSessionSharedAction,
  type AgentOpsBrowserShareScope,
} from '@/lib/agent-ops/browser-session-sharing'
import { ErrorService, supabase } from './client'

const BROWSER_SESSION_SHARING_MIGRATION = '20260502140000_agent_ops_browser_session_sharing.sql'

type BrowserSessionShareRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string
  session_key: string
  token_hash: string
  token_prefix: string
  scope: AgentOpsBrowserSessionShare['scope']
  status: AgentOpsBrowserSessionShare['status']
  granted_to_assistant_id: string | null
  granted_to_runtime_id: string | null
  granted_to_agent_label: string | null
  tab_identity: string
  rate_limit_per_minute: number
  expires_at: string
  created_by_user_id: string | null
  revoked_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type BrowserSessionActionRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string
  browser_share_id: string | null
  session_key: string
  token_prefix: string | null
  scope: AgentOpsBrowserSessionSharedAction['scope']
  action_type: AgentOpsBrowserSessionSharedAction['actionType']
  status: AgentOpsBrowserSessionSharedAction['status']
  actor_assistant_id: string | null
  actor_runtime_id: string | null
  actor_agent_label: string | null
  tab_identity: string | null
  current_url: string | null
  artifact_id: string | null
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const SHARE_SELECT = `
  id,
  org_id,
  project_id,
  ops_run_id,
  session_key,
  token_hash,
  token_prefix,
  scope,
  status,
  granted_to_assistant_id,
  granted_to_runtime_id,
  granted_to_agent_label,
  tab_identity,
  rate_limit_per_minute,
  expires_at,
  created_by_user_id,
  revoked_at,
  metadata,
  created_at,
  updated_at
`

const ACTION_SELECT = `
  id,
  org_id,
  project_id,
  ops_run_id,
  browser_share_id,
  session_key,
  token_prefix,
  scope,
  action_type,
  status,
  actor_assistant_id,
  actor_runtime_id,
  actor_agent_label,
  tab_identity,
  current_url,
  artifact_id,
  message,
  metadata,
  created_at
`

export async function createAgentOpsBrowserSessionShare(input: {
  orgId: string
  projectId?: string | null
  runId: string
  sessionKey: string
  scope: AgentOpsBrowserShareScope
  grantedToAssistantId?: string | null
  grantedToRuntimeId?: string | null
  grantedToAgentLabel?: string | null
  ttlSeconds?: number
  rateLimitPerMinute?: number
  createdByUserId?: string | null
  metadata?: Record<string, unknown>
}): Promise<{ share: AgentOpsBrowserSessionShare; token: string } | null> {
  const secret = createBrowserSessionShareSecret()
  const expiresAt = new Date(Date.now() + Math.min(Math.max(input.ttlSeconds ?? 900, 60), 3600) * 1000).toISOString()
  const tabIdentity = buildBrowserSessionTabIdentity({
    runId: input.runId,
    sessionKey: input.sessionKey,
    assistantId: input.grantedToAssistantId,
    runtimeId: input.grantedToRuntimeId,
    agentLabel: input.grantedToAgentLabel,
  })
  const parsed = browserSessionShareSchema.parse({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    runId: input.runId,
    sessionKey: input.sessionKey,
    tokenHash: secret.tokenHash,
    tokenPrefix: secret.tokenPrefix,
    scope: input.scope,
    status: 'active',
    grantedToAssistantId: input.grantedToAssistantId ?? null,
    grantedToRuntimeId: input.grantedToRuntimeId ?? null,
    grantedToAgentLabel: input.grantedToAgentLabel ?? null,
    tabIdentity,
    rateLimitPerMinute: input.rateLimitPerMinute ?? 30,
    expiresAt,
    createdByUserId: input.createdByUserId ?? null,
    metadata: input.metadata ?? {},
  })

  const { data, error } = await supabase
    .from('agent_ops_browser_session_shares')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      ops_run_id: parsed.runId,
      session_key: parsed.sessionKey,
      token_hash: parsed.tokenHash,
      token_prefix: parsed.tokenPrefix,
      scope: parsed.scope,
      status: parsed.status,
      granted_to_assistant_id: parsed.grantedToAssistantId ?? null,
      granted_to_runtime_id: parsed.grantedToRuntimeId ?? null,
      granted_to_agent_label: parsed.grantedToAgentLabel ?? null,
      tab_identity: parsed.tabIdentity,
      rate_limit_per_minute: parsed.rateLimitPerMinute,
      expires_at: parsed.expiresAt,
      created_by_user_id: parsed.createdByUserId ?? null,
      metadata: parsed.metadata,
    })
    .select(SHARE_SELECT)
    .single()

  if (error) {
    captureShareDbError(error, 'createAgentOpsBrowserSessionShare', {
      orgId: input.orgId,
      runId: input.runId,
      sessionKey: input.sessionKey,
    })
    return null
  }

  return { share: mapShareRow(data as BrowserSessionShareRow), token: secret.token }
}

export async function verifyAgentOpsBrowserSessionShareToken(
  token: string,
): Promise<AgentOpsBrowserSessionShare | null> {
  const tokenHash = hashBrowserSessionShareToken(token)
  const { data, error } = await supabase
    .from('agent_ops_browser_session_shares')
    .select(SHARE_SELECT)
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    captureShareDbError(error, 'verifyAgentOpsBrowserSessionShareToken', {})
    return null
  }
  return data ? mapShareRow(data as BrowserSessionShareRow) : null
}

export async function listAgentOpsBrowserSessionShares(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  sessionKey?: string | null
  status?: AgentOpsBrowserSessionShare['status'] | null
  limit?: number
}): Promise<AgentOpsBrowserSessionShare[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('agent_ops_browser_session_shares')
    .select(SHARE_SELECT)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('ops_run_id', input.runId)
  if (input.sessionKey) query = query.eq('session_key', input.sessionKey)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(cappedLimit)
  if (error) {
    captureShareDbError(error, 'listAgentOpsBrowserSessionShares', {
      orgId: input.orgId,
      runId: input.runId ?? null,
    })
    return []
  }
  return ((data ?? []) as BrowserSessionShareRow[]).map(mapShareRow)
}

export async function revokeAgentOpsBrowserSessionShare(input: {
  orgId: string
  shareId: string
}): Promise<AgentOpsBrowserSessionShare | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_session_shares')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', input.orgId)
    .eq('id', input.shareId)
    .select(SHARE_SELECT)
    .single()

  if (error) {
    captureShareDbError(error, 'revokeAgentOpsBrowserSessionShare', input)
    return null
  }
  return mapShareRow(data as BrowserSessionShareRow)
}

export async function recordAgentOpsBrowserSessionSharedAction(
  input: AgentOpsBrowserSessionSharedAction,
): Promise<AgentOpsBrowserSessionSharedAction | null> {
  const parsed = browserSessionSharedActionSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_ops_browser_session_actions')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      ops_run_id: parsed.runId,
      browser_share_id: parsed.shareId ?? null,
      session_key: parsed.sessionKey,
      token_prefix: parsed.tokenPrefix ?? null,
      scope: parsed.scope ?? null,
      action_type: parsed.actionType,
      status: parsed.status,
      actor_assistant_id: parsed.actorAssistantId ?? null,
      actor_runtime_id: parsed.actorRuntimeId ?? null,
      actor_agent_label: parsed.actorAgentLabel ?? null,
      tab_identity: parsed.tabIdentity ?? null,
      current_url: parsed.currentUrl ?? null,
      artifact_id: parsed.artifactId ?? null,
      message: parsed.message ?? null,
      metadata: parsed.metadata,
    })
    .select(ACTION_SELECT)
    .single()

  if (error) {
    captureShareDbError(error, 'recordAgentOpsBrowserSessionSharedAction', {
      orgId: parsed.orgId,
      runId: parsed.runId,
      sessionKey: parsed.sessionKey,
    })
    return null
  }
  return mapActionRow(data as BrowserSessionActionRow)
}

export async function listAgentOpsBrowserSessionSharedActions(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  sessionKey?: string | null
  limit?: number
}): Promise<AgentOpsBrowserSessionSharedAction[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('agent_ops_browser_session_actions')
    .select(ACTION_SELECT)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('ops_run_id', input.runId)
  if (input.sessionKey) query = query.eq('session_key', input.sessionKey)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(cappedLimit)
  if (error) {
    captureShareDbError(error, 'listAgentOpsBrowserSessionSharedActions', {
      orgId: input.orgId,
      runId: input.runId ?? null,
    })
    return []
  }
  return ((data ?? []) as BrowserSessionActionRow[]).map(mapActionRow)
}

function mapShareRow(row: BrowserSessionShareRow): AgentOpsBrowserSessionShare {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.ops_run_id,
    sessionKey: row.session_key,
    tokenHash: undefined,
    tokenPrefix: row.token_prefix,
    scope: row.scope,
    status: row.status,
    grantedToAssistantId: row.granted_to_assistant_id,
    grantedToRuntimeId: row.granted_to_runtime_id,
    grantedToAgentLabel: row.granted_to_agent_label,
    tabIdentity: row.tab_identity,
    rateLimitPerMinute: row.rate_limit_per_minute,
    expiresAt: row.expires_at,
    createdByUserId: row.created_by_user_id,
    revokedAt: row.revoked_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapActionRow(row: BrowserSessionActionRow): AgentOpsBrowserSessionSharedAction {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.ops_run_id,
    sessionKey: row.session_key,
    shareId: row.browser_share_id,
    tokenPrefix: row.token_prefix,
    scope: row.scope,
    actionType: row.action_type,
    status: row.status,
    actorAssistantId: row.actor_assistant_id,
    actorRuntimeId: row.actor_runtime_id,
    actorAgentLabel: row.actor_agent_label,
    tabIdentity: row.tab_identity,
    currentUrl: row.current_url,
    artifactId: row.artifact_id,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function captureShareDbError(error: unknown, operation: string, context: Record<string, unknown>) {
  ErrorService.captureException(error, {
    severity: 'warning',
    context: {
      ...context,
      operation,
      requiredMigration: isSchemaCacheMiss(error) ? BROWSER_SESSION_SHARING_MIGRATION : undefined,
    },
    tags: { layer: 'database', table: 'agent_ops_browser_session_shares' },
  })
}

function isSchemaCacheMiss(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST205'
  )
}
