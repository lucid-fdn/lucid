import 'server-only'

import { ErrorService, supabase } from './client'

export type TemplateProductEventType =
  | 'gallery_view'
  | 'detail_view'
  | 'preview'
  | 'install'
  | 'reconcile'
  | 'first_run'
  | 'repeat_use'
  | 'combine_view'
  | 'combine_click'

export interface RecordTemplateProductEventInput {
  orgId: string
  actorUserId?: string | null
  projectId?: string | null
  templateId?: string | null
  templateSlug: string
  templateName?: string | null
  templateType: 'agent' | 'team' | 'capability'
  backingKind?: 'lucid_pack' | null
  eventType: TemplateProductEventType
  source?: 'templates' | 'template_detail' | 'installed_capability' | 'channel' | 'mission_control' | 'api'
  installId?: string | null
  runId?: string | null
  metadata?: Record<string, unknown>
}

export interface TemplateProductFunnelTemplate {
  templateSlug: string
  templateName: string | null
  templateType: 'agent' | 'team' | 'capability'
  backingKind: 'lucid_pack' | null
  events: Record<TemplateProductEventType, number>
  conversion: {
    previewToInstall: number | null
    installToFirstRun: number | null
    firstRunToRepeatUse: number | null
  }
}

export interface TemplateProductFunnelSummary {
  orgId: string
  projectId: string | null
  since: string
  generatedAt: string
  totals: Record<TemplateProductEventType, number>
  topTemplates: TemplateProductFunnelTemplate[]
  dropOff: Array<{
    from: TemplateProductEventType
    to: TemplateProductEventType
    fromCount: number
    toCount: number
    dropOffRate: number | null
  }>
}

const PRODUCT_EVENT_TYPES: TemplateProductEventType[] = [
  'gallery_view',
  'detail_view',
  'preview',
  'install',
  'reconcile',
  'first_run',
  'repeat_use',
  'combine_view',
  'combine_click',
]

export async function recordTemplateProductEvent(input: RecordTemplateProductEventInput): Promise<void> {
  const { error } = await supabase
    .from('template_product_events')
    .insert({
      org_id: input.orgId,
      actor_user_id: input.actorUserId ?? null,
      project_id: input.projectId ?? null,
      template_id: input.templateId ?? null,
      template_slug: input.templateSlug,
      template_name: input.templateName ?? null,
      template_type: input.templateType,
      backing_kind: input.backingKind ?? null,
      event_type: input.eventType,
      source: input.source ?? 'templates',
      install_id: input.installId ?? null,
      run_id: input.runId ?? null,
      metadata: input.metadata ?? {},
    })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        operation: 'recordTemplateProductEvent',
        orgId: input.orgId,
        templateSlug: input.templateSlug,
        eventType: input.eventType,
      },
      tags: { layer: 'database', table: 'template_product_events' },
    })
  }
}

export async function getTemplateProductFunnelSummary(input: {
  orgId: string
  projectId?: string | null
  sinceDays?: number
  limit?: number
}): Promise<TemplateProductFunnelSummary> {
  const sinceDays = Math.min(Math.max(input.sinceDays ?? 30, 1), 365)
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('template_product_events')
    .select('template_slug, template_name, template_type, backing_kind, event_type, created_at')
    .eq('org_id', input.orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (input.projectId !== undefined) {
    query = input.projectId === null ? query.is('project_id', null) : query.eq('project_id', input.projectId)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        operation: 'getTemplateProductFunnelSummary',
        orgId: input.orgId,
        projectId: input.projectId ?? undefined,
      },
      tags: { layer: 'database', table: 'template_product_events' },
    })
  }

  const totals = emptyEventCounts()
  const byTemplate = new Map<string, TemplateProductFunnelTemplate>()

  for (const row of data ?? []) {
    const eventType = row.event_type as TemplateProductEventType
    if (!PRODUCT_EVENT_TYPES.includes(eventType)) continue
    totals[eventType] += 1
    const templateSlug = typeof row.template_slug === 'string' ? row.template_slug : 'unknown'
    const current = byTemplate.get(templateSlug) ?? {
      templateSlug,
      templateName: typeof row.template_name === 'string' ? row.template_name : null,
      templateType: normalizeTemplateType(row.template_type),
      backingKind: normalizeBackingKind(row.backing_kind),
      events: emptyEventCounts(),
      conversion: {
        previewToInstall: null,
        installToFirstRun: null,
        firstRunToRepeatUse: null,
      },
    }
    current.events[eventType] += 1
    if (!current.templateName && typeof row.template_name === 'string') current.templateName = row.template_name
    byTemplate.set(templateSlug, current)
  }

  const topTemplates = [...byTemplate.values()]
    .map((template) => ({
      ...template,
      conversion: {
        previewToInstall: ratio(template.events.install, template.events.preview),
        installToFirstRun: ratio(template.events.first_run, template.events.install),
        firstRunToRepeatUse: ratio(template.events.repeat_use, template.events.first_run),
      },
    }))
    .sort((a, b) => scoreTemplate(b) - scoreTemplate(a))
    .slice(0, input.limit ?? 12)

  return {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    since,
    generatedAt: new Date().toISOString(),
    totals,
    topTemplates,
    dropOff: [
      buildDropOff('preview', 'install', totals),
      buildDropOff('install', 'first_run', totals),
      buildDropOff('first_run', 'repeat_use', totals),
    ],
  }
}

function emptyEventCounts(): Record<TemplateProductEventType, number> {
  return PRODUCT_EVENT_TYPES.reduce((acc, eventType) => {
    acc[eventType] = 0
    return acc
  }, {} as Record<TemplateProductEventType, number>)
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 1000
}

function buildDropOff(
  from: TemplateProductEventType,
  to: TemplateProductEventType,
  totals: Record<TemplateProductEventType, number>,
): TemplateProductFunnelSummary['dropOff'][number] {
  const fromCount = totals[from]
  const toCount = totals[to]
  return {
    from,
    to,
    fromCount,
    toCount,
    dropOffRate: fromCount > 0 ? Math.round(((fromCount - toCount) / fromCount) * 1000) / 1000 : null,
  }
}

function scoreTemplate(template: TemplateProductFunnelTemplate): number {
  return template.events.install * 8
    + template.events.first_run * 12
    + template.events.repeat_use * 16
    + template.events.preview * 3
    + template.events.detail_view
}

function normalizeTemplateType(value: unknown): 'agent' | 'team' | 'capability' {
  return value === 'agent' || value === 'team' || value === 'capability' ? value : 'capability'
}

function normalizeBackingKind(value: unknown): 'lucid_pack' | null {
  return value === 'lucid_pack' ? value : null
}
