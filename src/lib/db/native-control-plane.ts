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
  NativeSessionHandoffInput,
  NativeSessionRefreshInput,
  NativeSessionRefreshResponse,
  NativeSessionRevokeInput,
  NativeShareInput,
  NativeVoiceCommandInput,
} from '@lucid/app-client'

import { isTransientSupabaseError, supabase } from './client'
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

function nativeToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}
