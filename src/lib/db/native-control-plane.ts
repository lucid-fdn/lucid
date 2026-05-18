import 'server-only'

import crypto from 'node:crypto'

import type {
  NativeActionDispatchInput,
  NativeActionDispatchResponse,
  NativeApproval,
  NativeApprovalDecisionInput,
  NativeRun,
  NativeRunControlInput,
  NativeRunTimelineEvent,
  NativeSessionExchangeInput,
  NativeSessionHandoffInput,
  NativeSessionRefreshInput,
  NativeSessionRefreshResponse,
  NativeSessionRevokeInput,
  NativeShareInput,
  NativeVoiceCommandInput,
} from '@lucid/app-client'
import type { AgentOpsRun, AgentOpsRunStatus } from '@/lib/agent-ops/workflow-types'

import { isTransientSupabaseError, supabase } from './client'
import {
  getAgentOpsRunDetail,
  getAgentOpsRunForOrg,
  listAgentOpsRunsForOrg,
  updateAgentOpsRunStatus,
} from './agent-ops'
import { resolveApproval } from './mission-control'
import { hashNativeSecret } from './native-devices'

type NativeApprovalRow = {
  id: string
  user_id: string
  workspace_id: string | null
  project_id: string | null
  run_id: string | null
  title: string
  summary: string
  agent_name: string | null
  risk: NativeApproval['risk']
  status: NativeApproval['status']
  expires_at: string | null
  deep_link: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

type NativeRunRow = {
  id: string
  user_id: string
  workspace_id: string | null
  project_id: string | null
  title: string
  agent_name: string | null
  status: NativeRun['status']
  progress: number | null
  needs_approval: boolean
  deep_link: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

type NativeRunEventRow = {
  id: string
  run_id: string
  user_id: string
  at: string
  title: string
  body: string | null
  actor: string | null
  level: NativeRunTimelineEvent['level']
  metadata: Record<string, unknown>
}

type NativeActionReceiptRow = {
  id: string
  action_id: string
  status: NativeActionDispatchResponse['status']
  created_at: string
}

type NativeSessionHandoffRow = {
  id: string
  user_id: string | null
  provider: string
  app_kind: NativeSessionHandoffInput['appKind']
  platform: NativeSessionHandoffInput['platform']
  install_id: string
  device_name: string | null
  return_url: string | null
  status: 'pending' | 'completed' | 'expired'
  expires_at: string
  exchange_token_hash: string | null
  exchanged_at: string | null
}

type MissionControlApprovalRow = {
  id: string
  org_id: string
  agent_id: string
  run_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  estimated_cost_usd: number | string | null
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'denied' | 'expired'
  requested_at: string
  expires_at: string
  ai_assistants?: { name?: string | null } | Array<{ name?: string | null }> | null
}

const MISSION_CONTROL_APPROVAL_PREFIX = 'mc:'
const AGENT_OPS_RUN_PREFIX = 'agentops:'

const NATIVE_APPROVAL_SELECT = `
  id,
  user_id,
  workspace_id,
  project_id,
  run_id,
  title,
  summary,
  agent_name,
  risk,
  status,
  expires_at,
  deep_link,
  metadata,
  created_at,
  updated_at
`

const NATIVE_RUN_SELECT = `
  id,
  user_id,
  workspace_id,
  project_id,
  title,
  agent_name,
  status,
  progress,
  needs_approval,
  deep_link,
  metadata,
  created_at,
  updated_at
`

const NATIVE_RUN_EVENT_SELECT = `
  id,
  run_id,
  user_id,
  at,
  title,
  body,
  actor,
  level,
  metadata
`

export function isNativeControlPlanePersistenceUnavailable(error: unknown): boolean {
  if (!hasConfiguredSupabase()) return true
  if (isTransientSupabaseError(error)) return true

  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error)

  return /native_(approvals|runs|run_events)|relation .* does not exist|schema cache|PGRST/i.test(message)
}

export function hasConfiguredSupabase(): boolean {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return Boolean(url && key && !/placeholder\.supabase\.co/i.test(url) && key !== 'placeholder-key')
}

export function mapNativeApprovalRow(row: NativeApprovalRow): NativeApproval {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    agentName: row.agent_name ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    projectId: row.project_id ?? undefined,
    runId: row.run_id ?? undefined,
    risk: row.risk,
    status: row.status,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    deepLink: row.deep_link ?? undefined,
  }
}

export function mapNativeRunRow(row: NativeRunRow): NativeRun {
  return {
    id: row.id,
    title: row.title,
    agentName: row.agent_name ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    projectId: row.project_id ?? undefined,
    status: row.status,
    progress: typeof row.progress === 'number' ? row.progress : undefined,
    needsApproval: row.needs_approval,
    updatedAt: row.updated_at,
    deepLink: row.deep_link ?? undefined,
  }
}

export function mapNativeRunEventRow(row: NativeRunEventRow): NativeRunTimelineEvent {
  return {
    id: row.id,
    at: row.at,
    title: row.title,
    body: row.body ?? undefined,
    actor: row.actor ?? undefined,
    level: row.level,
  }
}

export async function createNativeSessionHandoffRow(
  input: NativeSessionHandoffInput,
  userId: string | null,
): Promise<{ id: string; expiresAt: string; status: 'pending' | 'completed' | 'expired' }> {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('native_session_handoffs')
    .insert({
      user_id: userId,
      provider: input.provider ?? 'privy',
      app_kind: input.appKind,
      platform: input.platform,
      install_id: input.installId,
      device_name: input.deviceName ?? null,
      return_url: input.returnUrl ?? null,
      status: userId ? 'completed' : 'pending',
      expires_at: expiresAt,
      completed_at: userId ? new Date().toISOString() : null,
    })
    .select('id, status, expires_at')
    .single()

  if (error) throw error
  return {
    id: String(data.id),
    status: data.status as 'pending' | 'completed' | 'expired',
    expiresAt: String(data.expires_at),
  }
}

export async function completeNativeSessionHandoffRow(
  userId: string,
  handoffId: string,
): Promise<{ handoffId: string; redirectUrl: string; status: 'completed' | 'expired'; expiresAt: string }> {
  const exchangeToken = nativeToken('native_exchange')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('native_session_handoffs')
    .update({
      user_id: userId,
      status: 'completed',
      completed_at: now,
      exchange_token_hash: hashNativeSecret(exchangeToken),
    })
    .eq('id', handoffId)
    .in('status', ['pending', 'completed'])
    .gt('expires_at', now)
    .select('id, return_url, expires_at')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return {
      handoffId,
      status: 'expired',
      expiresAt: now,
      redirectUrl: `lucid://auth/native?native_handoff=${encodeURIComponent(handoffId)}&status=expired`,
    }
  }

  const redirectUrl = new URL(
    typeof data.return_url === 'string' && data.return_url ? data.return_url : 'lucid://auth/native',
  )
  redirectUrl.searchParams.set('native_handoff', String(data.id))
  redirectUrl.searchParams.set('exchange_token', exchangeToken)
  redirectUrl.searchParams.set('status', 'completed')

  return {
    handoffId: String(data.id),
    status: 'completed',
    expiresAt: String(data.expires_at),
    redirectUrl: redirectUrl.toString(),
  }
}

export async function exchangeNativeSessionHandoffRow(
  input: NativeSessionExchangeInput,
): Promise<NativeSessionRefreshResponse> {
  const now = new Date().toISOString()
  const { data: handoff, error: handoffError } = await supabase
    .from('native_session_handoffs')
    .select(`
      id,
      user_id,
      provider,
      app_kind,
      platform,
      install_id,
      device_name,
      return_url,
      status,
      expires_at,
      exchange_token_hash,
      exchanged_at
    `)
    .eq('id', input.handoffId)
    .eq('exchange_token_hash', hashNativeSecret(input.exchangeToken))
    .maybeSingle()

  if (handoffError) throw handoffError
  const row = handoff as NativeSessionHandoffRow | null
  if (!row?.user_id || row.status !== 'completed' || row.exchanged_at) {
    throw new Error('Native handoff is not exchangeable.')
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('Native handoff has expired.')
  }

  const { error: reserveError } = await supabase
    .from('native_session_handoffs')
    .update({ exchanged_at: now })
    .eq('id', row.id)
    .is('exchanged_at', null)
    .select('id')
    .single()

  if (reserveError) {
    if ('code' in reserveError && reserveError.code === 'PGRST116') {
      throw new Error('Native handoff has already been exchanged.')
    }
    throw reserveError
  }

  const { data: device, error: deviceError } = await supabase
    .from('native_devices')
    .upsert({
      user_id: row.user_id,
      org_id: null,
      platform: row.platform,
      app_kind: row.app_kind,
      install_id: row.install_id,
      device_name: input.deviceName ?? row.device_name ?? null,
      app_version: input.appVersion ?? null,
      os_version: input.osVersion ?? null,
      metadata: { sessionProvider: row.provider, handoffId: row.id },
      notification_settings: {},
      last_seen_at: now,
      revoked_at: null,
      updated_at: now,
    }, { onConflict: 'user_id,app_kind,install_id' })
    .select('id')
    .single()

  if (deviceError) throw deviceError

  const accessToken = nativeToken('native_access')
  const refreshToken = nativeToken('native_refresh')
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
  const deviceId = String(device.id)

  const { error: sessionError } = await supabase
    .from('native_auth_sessions')
    .insert({
      user_id: row.user_id,
      device_id: deviceId,
      token_hash: hashNativeSecret(accessToken),
      refresh_token_hash: hashNativeSecret(refreshToken),
      expires_at: expiresAt,
      last_used_at: now,
    })

  if (sessionError) throw sessionError

  const { error: consumeError } = await supabase
    .from('native_session_handoffs')
    .update({ exchange_device_id: deviceId })
    .eq('id', row.id)

  if (consumeError) throw consumeError

  return {
    accessToken,
    refreshToken,
    expiresAt,
    deviceId,
  }
}

export async function refreshNativeSessionRow(
  userId: string,
  input: NativeSessionRefreshInput,
): Promise<NativeSessionRefreshResponse> {
  const now = new Date().toISOString()
  const oldRefreshHash = hashNativeSecret(input.refreshToken)

  const { data: device, error: deviceError } = await supabase
    .from('native_devices')
    .select('id, revoked_at')
    .eq('id', input.deviceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (deviceError) throw deviceError
  if (!device || device.revoked_at) throw new Error('Native device is not active.')

  const { data: existing, error: existingError } = await supabase
    .from('native_auth_sessions')
    .select('id, user_id, device_id, expires_at, revoked_at')
    .eq('refresh_token_hash', oldRefreshHash)
    .eq('user_id', userId)
    .eq('device_id', input.deviceId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) throw new Error('Invalid native refresh token.')
  if (existing.revoked_at || new Date(String(existing.expires_at)).getTime() <= Date.now()) {
    throw new Error('Native refresh token is revoked or expired.')
  }

  const accessToken = nativeToken('native_access')
  const refreshToken = nativeToken('native_refresh')
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()

  const { error: revokeError } = await supabase
    .from('native_auth_sessions')
    .update({ revoked_at: now, last_used_at: now })
    .eq('id', existing.id)
    .is('revoked_at', null)

  if (revokeError) throw revokeError

  const { error: insertError } = await supabase
    .from('native_auth_sessions')
    .insert({
      user_id: userId,
      device_id: input.deviceId,
      token_hash: hashNativeSecret(accessToken),
      refresh_token_hash: hashNativeSecret(refreshToken),
      expires_at: expiresAt,
      last_used_at: now,
    })

  if (insertError) throw insertError

  return {
    accessToken,
    refreshToken,
    expiresAt,
    deviceId: input.deviceId,
  }
}

export async function revokeNativeSessionRow(userId: string, input: NativeSessionRevokeInput): Promise<void> {
  const updates = { revoked_at: new Date().toISOString() }
  let query = supabase
    .from('native_auth_sessions')
    .update(updates)
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (input.deviceId) query = query.eq('device_id', input.deviceId)
  if (input.refreshToken) query = query.eq('refresh_token_hash', hashNativeSecret(input.refreshToken))

  const { error } = await query
  if (error) throw error
}

export async function listNativeApprovalsRows(userId: string): Promise<NativeApproval[]> {
  const { data, error } = await supabase
    .from('native_approvals')
    .select(NATIVE_APPROVAL_SELECT)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as NativeApprovalRow[]).map(mapNativeApprovalRow)
}

export async function listNativeRunRows(userId: string): Promise<NativeRun[]> {
  const { data, error } = await supabase
    .from('native_runs')
    .select(NATIVE_RUN_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as NativeRunRow[]).map(mapNativeRunRow)
}

export async function listMissionControlNativeApprovals(userId: string): Promise<NativeApproval[]> {
  const orgIds = await getNativeUserOrgIds(userId)
  if (orgIds.length === 0) return []

  const { data, error } = await supabase
    .from('mc_pending_approvals')
    .select(`
      id,
      org_id,
      agent_id,
      run_id,
      tool_name,
      tool_args,
      estimated_cost_usd,
      risk_level,
      status,
      requested_at,
      expires_at,
      ai_assistants(name)
    `)
    .in('org_id', orgIds)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return ((data ?? []) as MissionControlApprovalRow[]).map(mapMissionControlApproval)
}

export async function getMissionControlNativeApproval(
  userId: string,
  approvalId: string,
): Promise<NativeApproval | null> {
  const sourceId = stripSourcePrefix(approvalId, MISSION_CONTROL_APPROVAL_PREFIX)
  const orgIds = await getNativeUserOrgIds(userId)
  if (!sourceId || orgIds.length === 0) return null

  const { data, error } = await supabase
    .from('mc_pending_approvals')
    .select(`
      id,
      org_id,
      agent_id,
      run_id,
      tool_name,
      tool_args,
      estimated_cost_usd,
      risk_level,
      status,
      requested_at,
      expires_at,
      ai_assistants(name)
    `)
    .eq('id', sourceId)
    .in('org_id', orgIds)
    .maybeSingle()

  if (error) throw error
  return data ? mapMissionControlApproval(data as MissionControlApprovalRow) : null
}

export async function decideMissionControlNativeApproval(
  userId: string,
  approvalId: string,
  input: NativeApprovalDecisionInput,
): Promise<NativeApproval | null> {
  const sourceId = stripSourcePrefix(approvalId, MISSION_CONTROL_APPROVAL_PREFIX)
  const orgIds = await getNativeUserOrgIds(userId)
  if (!sourceId || orgIds.length === 0) return null

  const { data: approval, error } = await supabase
    .from('mc_pending_approvals')
    .select('id, org_id')
    .eq('id', sourceId)
    .in('org_id', orgIds)
    .eq('status', 'pending')
    .maybeSingle()

  if (error) throw error
  if (!approval?.org_id) return null

  const result = await resolveApproval(
    sourceId,
    String(approval.org_id),
    userId,
    {
      approval_id: sourceId,
      action: input.decision === 'approve' ? 'approved' : 'denied',
      reason: input.reason,
    },
  )
  if (!result.success) throw new Error(result.error ?? 'Failed to resolve Mission Control approval.')

  return getMissionControlNativeApproval(userId, approvalId)
}

export async function listAgentOpsNativeRuns(userId: string): Promise<NativeRun[]> {
  const orgIds = await getNativeUserOrgIds(userId)
  const runGroups = await Promise.all(
    orgIds.map((orgId) => listAgentOpsRunsForOrg(orgId, { limit: 50 })),
  )

  return runGroups
    .flat()
    .map(mapAgentOpsRun)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

export async function getAgentOpsNativeRun(userId: string, runId: string): Promise<NativeRun | null> {
  const sourceId = stripSourcePrefix(runId, AGENT_OPS_RUN_PREFIX)
  const orgIds = await getNativeUserOrgIds(userId)
  if (!sourceId || orgIds.length === 0) return null

  for (const orgId of orgIds) {
    const run = await getAgentOpsRunForOrg(orgId, sourceId)
    if (run) return mapAgentOpsRun(run)
  }

  return null
}

export async function listAgentOpsNativeRunEvents(
  userId: string,
  runId: string,
): Promise<NativeRunTimelineEvent[]> {
  const sourceId = stripSourcePrefix(runId, AGENT_OPS_RUN_PREFIX)
  const orgIds = await getNativeUserOrgIds(userId)
  if (!sourceId || orgIds.length === 0) return []

  for (const orgId of orgIds) {
    const detail = await getAgentOpsRunDetail(orgId, sourceId)
    if (!detail) continue

    const events: NativeRunTimelineEvent[] = [
      {
        id: `${runId}:created`,
        at: detail.run.createdAt,
        title: 'Agent Ops run created',
        body: detail.run.scope.label ?? detail.run.workflowId,
        actor: 'Agent Ops',
        level: 'info',
      },
      {
        id: `${runId}:status`,
        at: detail.run.updatedAt,
        title: `Status: ${mapAgentOpsStatus(detail.run)}`,
        body: detail.run.errorMessage ?? summarizeAgentOpsRun(detail.run),
        actor: 'Agent Ops',
        level: levelForAgentOpsStatus(detail.run.status),
      },
      ...detail.timelineEvents.map((event) => ({
        id: `agentops-timeline:${event.id}`,
        at: event.createdAt,
        title: event.title,
        body: event.body ?? undefined,
        actor: 'Mission Control',
        level: 'info' as const,
      })),
      ...detail.findings.slice(0, 8).map((finding) => ({
        id: `agentops-finding:${finding.id}`,
        at: finding.createdAt,
        title: finding.title,
        body: finding.body,
        actor: 'Agent Ops Finding',
        level: finding.severity === 'critical' || finding.severity === 'high' ? 'warning' as const : 'info' as const,
      })),
      ...detail.artifacts.slice(0, 8).map((artifact) => ({
        id: `agentops-artifact:${artifact.id}`,
        at: artifact.createdAt,
        title: artifact.title,
        body: artifact.summary ?? artifact.uri ?? undefined,
        actor: 'Agent Ops Artifact',
        level: 'success' as const,
      })),
    ]

    return events.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
  }

  return []
}

export async function controlAgentOpsNativeRun(
  userId: string,
  runId: string,
  input: NativeRunControlInput,
): Promise<NativeRun | null> {
  const sourceId = stripSourcePrefix(runId, AGENT_OPS_RUN_PREFIX)
  const orgIds = await getNativeUserOrgIds(userId)
  if (!sourceId || orgIds.length === 0) return null

  for (const orgId of orgIds) {
    const existing = await getAgentOpsRunForOrg(orgId, sourceId)
    if (!existing) continue
    if (input.action === 'open') return mapAgentOpsRun(existing)

    const nextStatus = agentOpsStatusForNativeAction(input.action)
    const metadata = {
      ...existing.metadata,
      nativeControl: {
        action: input.action,
        reason: input.reason ?? null,
        userId,
        at: new Date().toISOString(),
      },
      nativePaused: input.action === 'pause' ? true : input.action === 'resume' ? false : Boolean(existing.metadata.nativePaused),
      nativeEscalated: input.action === 'escalate' ? true : Boolean(existing.metadata.nativeEscalated),
    }

    const updated = await updateAgentOpsRunStatus({
      orgId,
      runId: sourceId,
      status: nextStatus,
      errorMessage: input.action === 'cancel' ? input.reason ?? 'Cancelled from native app.' : existing.errorMessage,
      metadata,
    })

    return mapAgentOpsRun(updated)
  }

  return null
}

export async function getNativeApprovalRow(userId: string, approvalId: string): Promise<NativeApproval | null> {
  const { data, error } = await supabase
    .from('native_approvals')
    .select(NATIVE_APPROVAL_SELECT)
    .eq('user_id', userId)
    .eq('id', approvalId)
    .maybeSingle()

  if (error) throw error
  return data ? mapNativeApprovalRow(data as NativeApprovalRow) : null
}

export async function getNativeRunRow(userId: string, runId: string): Promise<NativeRun | null> {
  const { data, error } = await supabase
    .from('native_runs')
    .select(NATIVE_RUN_SELECT)
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle()

  if (error) throw error
  return data ? mapNativeRunRow(data as NativeRunRow) : null
}

export async function listNativeRunEventRows(userId: string, runId: string): Promise<NativeRunTimelineEvent[]> {
  const { data, error } = await supabase
    .from('native_run_events')
    .select(NATIVE_RUN_EVENT_SELECT)
    .eq('user_id', userId)
    .eq('run_id', runId)
    .order('at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as NativeRunEventRow[]).map(mapNativeRunEventRow)
}

export async function decideNativeApprovalRow(
  userId: string,
  approvalId: string,
  input: NativeApprovalDecisionInput,
): Promise<NativeApproval | null> {
  const status = input.decision === 'approve' ? 'approved' : 'denied'
  const { data, error } = await supabase
    .from('native_approvals')
    .update({
      status,
      decision_reason: input.reason ?? null,
      decided_by_device_id: input.deviceId ?? null,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', approvalId)
    .select(NATIVE_APPROVAL_SELECT)
    .maybeSingle()

  if (error) throw error
  return data ? mapNativeApprovalRow(data as NativeApprovalRow) : null
}

export async function controlNativeRunRow(
  userId: string,
  runId: string,
  input: NativeRunControlInput,
): Promise<NativeRun | null> {
  const now = new Date().toISOString()
  const nextStatus: NativeRun['status'] | null =
    input.action === 'pause'
      ? 'paused'
      : input.action === 'resume'
        ? 'running'
        : input.action === 'cancel'
          ? 'cancelled'
          : input.action === 'escalate'
            ? 'blocked'
            : null

  const { data: existing, error: getError } = await supabase
    .from('native_runs')
    .select(NATIVE_RUN_SELECT)
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle()

  if (getError) throw getError
  if (!existing) return null

  const updates: Record<string, unknown> = { updated_at: now }
  if (nextStatus) updates.status = nextStatus
  if (input.action === 'escalate') updates.needs_approval = true

  const { data, error } = await supabase
    .from('native_runs')
    .update(updates)
    .eq('user_id', userId)
    .eq('id', runId)
    .select(NATIVE_RUN_SELECT)
    .single()

  if (error) throw error

  await createNativeRunEventRow({
    userId,
    runId,
    title: `Native ${input.action}`,
    body: input.reason ? `Reason: ${input.reason}` : 'Command sent from a trusted native app.',
    actor: 'Native app',
    level: input.action === 'cancel' ? 'warning' : 'info',
    at: now,
  })

  return mapNativeRunRow(data as NativeRunRow)
}

export async function createNativeVoiceCommandRow(
  userId: string,
  input: NativeVoiceCommandInput,
  response: {
    commandId: string
    interpretedCommand: string
    requiresConfirmation: boolean
    risk: 'passive' | 'user-initiated' | 'confirmation-required' | 'privileged'
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('native_command_events')
    .insert({
      user_id: userId,
      device_id: input.deviceId ?? null,
      kind: 'voice',
      intent: input.mode,
      interpreted_command: response.interpretedCommand,
      risk: response.risk,
      requires_confirmation: response.requiresConfirmation,
      payload: {
        locale: input.locale ?? null,
        context: input.context ?? null,
        audioUploadId: input.audioUploadId ?? null,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

export async function shareToLucidRow(userId: string, input: NativeShareInput, title: string): Promise<{
  itemId: string
  deepLink?: string
}> {
  const { data: commandEvent, error: commandError } = await supabase
    .from('native_command_events')
    .insert({
      user_id: userId,
      device_id: input.deviceId ?? null,
      kind: 'share',
      intent: input.intent,
      interpreted_command: title,
      risk: 'user-initiated',
      requires_confirmation: false,
      payload: {
        kind: input.kind,
        contentHash: crypto.createHash('sha256').update(input.content).digest('hex'),
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        context: input.context ?? null,
      },
    })
    .select('id')
    .single()

  if (commandError) throw commandError

  if (!['bug-report', 'browser-qa', 'investigate'].includes(input.intent)) {
    return { itemId: String(commandEvent.id), deepLink: `lucid://workspace/default/capture/${commandEvent.id}` }
  }

  const { data: run, error: runError } = await supabase
    .from('native_runs')
    .insert({
      user_id: userId,
      workspace_id: input.context?.workspaceId ?? null,
      project_id: input.context?.projectId ?? null,
      title,
      agent_name: input.intent === 'browser-qa' ? 'Browser QA' : 'Ops Copilot',
      status: 'queued',
      progress: 0,
      needs_approval: false,
      source_kind: 'share',
      source_id: String(commandEvent.id),
      metadata: {
        shareKind: input.kind,
        shareIntent: input.intent,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
      },
    })
    .select(NATIVE_RUN_SELECT)
    .single()

  if (runError) throw runError

  const mappedRun = mapNativeRunRow(run as NativeRunRow)
  await createNativeRunEventRow({
    userId,
    runId: mappedRun.id,
    title: 'Created from native share',
    body: title,
    actor: 'Share To Lucid',
    level: 'info',
  })

  return { itemId: mappedRun.id, deepLink: mappedRun.deepLink ?? `lucid://workspace/default/runs/${mappedRun.id}` }
}

export async function recordNativeActionReceiptRow(
  userId: string,
  input: NativeActionDispatchInput,
): Promise<NativeActionDispatchResponse> {
  const payload = {
    user_id: userId,
    device_id: input.deviceId ?? null,
    feature_id: input.featureId,
    action_id: input.actionId,
    idempotency_key: input.idempotencyKey,
    status: input.confirmation || input.featureId === 'commandCapture' ? 'queued' : 'requires-confirmation',
    confirmation_method: input.confirmation?.method ?? null,
    confirmation_receipt: input.confirmation?.receipt ?? null,
    payload: {
      ...input.payload,
      context: input.context ?? null,
      confirmedAt: input.confirmation?.confirmedAt ?? null,
    },
  }

  const { data, error } = await supabase
    .from('native_action_receipts')
    .upsert(payload, { onConflict: 'user_id,idempotency_key' })
    .select('id, action_id, status, created_at')
    .single()

  if (error) throw error
  const receipt = data as NativeActionReceiptRow
  return {
    actionId: receipt.action_id,
    status: receipt.status,
    receiptId: receipt.id,
    message: input.confirmation
      ? 'Native action accepted with confirmation receipt.'
      : 'Native action recorded and awaiting confirmation if required.',
  }
}

async function createNativeRunEventRow(input: {
  userId: string
  runId: string
  title: string
  body?: string
  actor?: string
  level?: NativeRunTimelineEvent['level']
  at?: string
}): Promise<void> {
  const { error } = await supabase
    .from('native_run_events')
    .insert({
      user_id: input.userId,
      run_id: input.runId,
      at: input.at ?? new Date().toISOString(),
      title: input.title,
      body: input.body ?? null,
      actor: input.actor ?? null,
      level: input.level ?? 'info',
    })

  if (error) throw error
}

async function getNativeUserOrgIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)

  if (error) throw error
  return Array.from(new Set((data ?? []).map((row) => String(row.organization_id)).filter(Boolean)))
}

function stripSourcePrefix(id: string, prefix: string): string | null {
  if (id.startsWith(prefix)) return id.slice(prefix.length)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null
}

function mapMissionControlApproval(row: MissionControlApprovalRow): NativeApproval {
  const assistant = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
  const cost = row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd)
  const risk: NativeApproval['risk'] =
    row.risk_level === 'critical' || row.risk_level === 'high' ? 'privileged' : 'confirmation-required'

  return {
    id: `${MISSION_CONTROL_APPROVAL_PREFIX}${row.id}`,
    title: `Approve ${formatNativeLabel(row.tool_name)}`,
    summary: [
      `${assistant?.name ?? 'Agent'} wants to run ${formatNativeLabel(row.tool_name)}.`,
      cost && Number.isFinite(cost) ? `Estimated cost: $${cost.toFixed(2)}.` : null,
    ].filter(Boolean).join(' '),
    agentName: assistant?.name ?? 'Mission Control',
    workspaceId: row.org_id,
    runId: row.run_id,
    risk,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.requested_at,
    deepLink: `lucid://workspace/${row.org_id}/approvals/${encodeURIComponent(`${MISSION_CONTROL_APPROVAL_PREFIX}${row.id}`)}`,
  }
}

function mapAgentOpsRun(run: AgentOpsRun): NativeRun {
  const status = mapAgentOpsStatus(run)
  const workflowName = typeof run.metadata.workflow_name === 'string'
    ? run.metadata.workflow_name
    : formatNativeLabel(run.workflowId)

  return {
    id: `${AGENT_OPS_RUN_PREFIX}${run.id}`,
    title: run.scope.label ?? workflowName,
    agentName: 'Agent Ops',
    workspaceId: run.orgId,
    projectId: run.projectId ?? undefined,
    status,
    progress: progressForAgentOpsRun(run),
    needsApproval: status === 'blocked' || Boolean(run.metadata.nativeEscalated),
    updatedAt: run.updatedAt,
    deepLink: `lucid://workspace/${run.orgId}/runs/${encodeURIComponent(`${AGENT_OPS_RUN_PREFIX}${run.id}`)}`,
  }
}

function mapAgentOpsStatus(run: AgentOpsRun): NativeRun['status'] {
  if (run.status === 'blocked' && run.metadata.nativePaused) return 'paused'
  return run.status
}

function progressForAgentOpsRun(run: AgentOpsRun): number | undefined {
  if (typeof run.metadata.progress === 'number') return Math.min(Math.max(run.metadata.progress, 0), 100)
  if (run.status === 'completed') return 100
  if (run.status === 'queued') return 0
  return undefined
}

function summarizeAgentOpsRun(run: AgentOpsRun): string {
  const parts = [
    run.artifactCount > 0 ? `${run.artifactCount} artifact${run.artifactCount === 1 ? '' : 's'}` : null,
    run.findingCount > 0 ? `${run.findingCount} finding${run.findingCount === 1 ? '' : 's'}` : null,
    run.costUsd > 0 ? `$${run.costUsd.toFixed(2)} estimated cost` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Agent Ops is tracking this run from Mission Control.'
}

function levelForAgentOpsStatus(status: AgentOpsRunStatus): NativeRunTimelineEvent['level'] {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'error'
  if (status === 'blocked') return 'warning'
  return 'info'
}

function agentOpsStatusForNativeAction(action: NativeRunControlInput['action']): AgentOpsRunStatus {
  if (action === 'cancel') return 'cancelled'
  if (action === 'resume') return 'running'
  if (action === 'pause' || action === 'escalate') return 'blocked'
  return 'running'
}

function formatNativeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function nativeToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}
