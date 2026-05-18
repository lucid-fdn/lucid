import 'server-only'

import type {
  CreateSystemNoticeInput,
  SystemNotice,
  SystemNoticeTone,
  SystemNoticeType,
} from '@contracts/system-notice'
import { ErrorService, supabase } from './client'

const SYSTEM_NOTICE_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'run_id',
  'agent_id',
  'notice_type',
  'tone',
  'title',
  'body',
  'channel_type',
  'dedupe_key',
  'metadata',
  'actions',
  'details',
  'acknowledged_at',
  'resolved_at',
  'created_at',
].join(', ')

type SystemNoticeRow = {
  id: string
  org_id: string
  project_id: string | null
  run_id: string | null
  agent_id: string | null
  notice_type: SystemNoticeType
  tone: SystemNoticeTone
  title: string
  body: string
  channel_type: string | null
  dedupe_key: string | null
  metadata: SystemNotice['metadata'] | null
  actions: SystemNotice['actions'] | null
  details: Record<string, unknown> | null
  acknowledged_at: string | null
  resolved_at: string | null
  created_at: string
}

export async function createSystemNotice(input: CreateSystemNoticeInput): Promise<SystemNotice | null> {
  const payload = {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    run_id: input.runId ?? null,
    agent_id: input.agentId ?? null,
    notice_type: input.type,
    tone: input.tone,
    title: input.title,
    body: input.body,
    channel_type: input.channelType ?? null,
    dedupe_key: input.dedupeKey ?? null,
    metadata: input.metadata ?? [],
    actions: input.actions ?? [],
    details: input.details ?? {},
    created_by_user_id: input.createdByUserId ?? null,
  }

  const { data, error } = await supabase
    .from('mission_control_system_notices')
    .insert(payload)
    .select(SYSTEM_NOTICE_COLUMNS)
    .single()

  if (error) {
    if (input.dedupeKey && error.code === '23505') {
      return getSystemNoticeByDedupeKey(input.orgId, input.dedupeKey)
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, type: input.type, operation: 'createSystemNotice' },
      tags: { layer: 'database', table: 'mission_control_system_notices' },
    })
    return null
  }

  return mapSystemNotice(data as unknown as SystemNoticeRow)
}

export async function getSystemNoticeByDedupeKey(orgId: string, dedupeKey: string): Promise<SystemNotice | null> {
  const { data, error } = await supabase
    .from('mission_control_system_notices')
    .select(SYSTEM_NOTICE_COLUMNS)
    .eq('org_id', orgId)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, dedupeKey, operation: 'getSystemNoticeByDedupeKey' },
      tags: { layer: 'database', table: 'mission_control_system_notices' },
    })
    return null
  }

  return data ? mapSystemNotice(data as unknown as SystemNoticeRow) : null
}

export async function listSystemNotices(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  unresolvedOnly?: boolean
  limit?: number
}): Promise<SystemNotice[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('mission_control_system_notices')
    .select(SYSTEM_NOTICE_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('run_id', input.runId)
  if (input.unresolvedOnly) query = query.is('resolved_at', null)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, operation: 'listSystemNotices' },
      tags: { layer: 'database', table: 'mission_control_system_notices' },
    })
    return []
  }

  return ((data ?? []) as unknown as SystemNoticeRow[]).map(mapSystemNotice)
}

export async function updateSystemNoticeStatus(input: {
  orgId: string
  noticeId: string
  action: 'acknowledge' | 'resolve' | 'reopen'
}): Promise<SystemNotice | null> {
  const patch = input.action === 'acknowledge'
    ? { acknowledged_at: new Date().toISOString() }
    : input.action === 'resolve'
      ? { resolved_at: new Date().toISOString() }
      : { resolved_at: null }

  const { data, error } = await supabase
    .from('mission_control_system_notices')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.noticeId)
    .select(SYSTEM_NOTICE_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, noticeId: input.noticeId, action: input.action, operation: 'updateSystemNoticeStatus' },
      tags: { layer: 'database', table: 'mission_control_system_notices' },
    })
    return null
  }

  return mapSystemNotice(data as unknown as SystemNoticeRow)
}

function mapSystemNotice(row: SystemNoticeRow): SystemNotice {
  return {
    id: row.id,
    type: row.notice_type,
    tone: row.tone,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.run_id,
    agentId: row.agent_id,
    channelType: row.channel_type,
    dedupeKey: row.dedupe_key,
    metadata: row.metadata ?? [],
    actions: row.actions ?? [],
    details: row.details ?? {},
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
  }
}
