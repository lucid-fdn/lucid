import 'server-only'

import type { AppDeployment } from '@contracts/app-service'
import {
  agentOpsClassForEventType,
  agentOpsStackForEventType,
} from '@contracts/agentops'
import { supabase, ErrorService } from '@/lib/db/client'
import { getAppDeployment } from '../deployments'
import { AppServiceError } from '../errors'
import { recordAppServiceMetric, withAppServiceSpan } from '../observability'
import { redactAppServiceMetadata, redactAppServiceText } from '../security-redaction'

export interface AgentOpsFeedItem {
  id: string
  type: string
  severity: 'debug' | 'info' | 'warning' | 'error'
  message: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface ListAppAgentOpsFeedOptions {
  orgId?: string
  generationRunId?: string | null
  assistantIds?: string[]
  limit?: number
}

type AppAgentOpsSource = 'app_deployment_events' | 'runtime_events'

interface DbAppDeploymentEvent {
  id: string
  app_deployment_id?: string | null
  generation_run_id?: string | null
  event_type: string
  severity?: string | null
  message?: string | null
  provider?: string | null
  external_id?: string | null
  payload?: Record<string, unknown> | null
  created_at: string
}

interface DbRuntimeEvent {
  id: string
  agent_id?: string | null
  event_type: string
  severity?: string | null
  payload?: Record<string, unknown> | null
  created_at: string
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100)
}

function normalizeSeverity(value: string | null | undefined): AgentOpsFeedItem['severity'] {
  if (value === 'debug') return 'debug'
  if (value === 'error' || value === 'critical') return 'error'
  if (value === 'warn' || value === 'warning') return 'warning'
  return 'info'
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function humanizeEventType(eventType: string): string {
  return eventType
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function hasAppReference(payload: Record<string, unknown>, appDeploymentId: string): boolean {
  return payload.appDeploymentId === appDeploymentId
    || payload.app_deployment_id === appDeploymentId
    || payload.lucid_app_deployment_id === appDeploymentId
}

function hasGenerationReference(payload: Record<string, unknown>, generationRunId?: string | null): boolean {
  if (!generationRunId) return false
  return payload.generationRunId === generationRunId
    || payload.generation_run_id === generationRunId
}

function hasAssistantReference(
  event: Pick<DbRuntimeEvent, 'agent_id' | 'payload'>,
  assistantIds: Set<string>,
): boolean {
  if (assistantIds.size === 0) return false
  const payload = safeMetadata(event.payload)
  const assistantId = event.agent_id
    ?? metadataString(payload, 'assistantId')
    ?? metadataString(payload, 'assistant_id')
  return Boolean(assistantId && assistantIds.has(assistantId))
}

function decorateMetadata(
  source: AppAgentOpsSource,
  eventType: string,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const eventClass = agentOpsClassForEventType(eventType)
  const stackId = metadataString(metadata, 'stackId')
    ?? metadataString(metadata, 'stack_id')
    ?? agentOpsStackForEventType(eventType)

  return redactAppServiceMetadata({
    ...metadata,
    source,
    event_class: eventClass,
    stack_id: stackId,
  })
}

function appEventToFeedItem(event: DbAppDeploymentEvent): AgentOpsFeedItem {
  const metadata = {
    ...safeMetadata(event.payload),
    app_deployment_id: event.app_deployment_id ?? undefined,
    generation_run_id: event.generation_run_id ?? undefined,
    provider: event.provider ?? undefined,
    external_id: event.external_id ?? undefined,
  }

  return {
    id: event.id,
    type: event.event_type,
    severity: normalizeSeverity(event.severity),
    message: event.message
      ? redactAppServiceText(event.message)
      : humanizeEventType(event.event_type),
    created_at: event.created_at,
    metadata: decorateMetadata('app_deployment_events', event.event_type, metadata),
  }
}

function runtimeEventToFeedItem(event: DbRuntimeEvent, matchedBy: string): AgentOpsFeedItem {
  const metadata = {
    ...safeMetadata(event.payload),
    agent_id: event.agent_id ?? undefined,
    matched_by: matchedBy,
  }

  return {
    id: event.id,
    type: event.event_type,
    severity: normalizeSeverity(event.severity),
    message: humanizeEventType(event.event_type),
    created_at: event.created_at,
    metadata: decorateMetadata('runtime_events', event.event_type, metadata),
  }
}

async function resolveAppContext(
  appDeploymentId: string,
  options: ListAppAgentOpsFeedOptions,
): Promise<Pick<AppDeployment, 'id' | 'org_id' | 'generation_run_id' | 'assistant_ids' | 'project_id' | 'slug'> | null> {
  if (options.orgId) {
    return {
      id: appDeploymentId,
      org_id: options.orgId,
      generation_run_id: options.generationRunId ?? null,
      assistant_ids: options.assistantIds ?? [],
      project_id: '',
      slug: '',
    }
  }

  const app = await getAppDeployment(appDeploymentId)
  return app
}

export async function listAppAgentOpsFeed(
  appDeploymentId: string,
  options: ListAppAgentOpsFeedOptions = {},
): Promise<AgentOpsFeedItem[]> {
  const limit = normalizeLimit(options.limit)
  return withAppServiceSpan('app_service.runtime.operator.agentops.feed', {
    stage: 'runtime.operator',
    operation: 'listAppAgentOpsFeed',
    appDeploymentId,
    appRuntimeApiVersion: 'v1',
  }, async () => {
    try {
      const app = await resolveAppContext(appDeploymentId, options)
      if (!app) {
        throw new AppServiceError('not_found', 'Generated app was not found.', 404)
      }

      const assistantIds = new Set(options.assistantIds ?? app.assistant_ids ?? [])
      const generationRunId = options.generationRunId ?? app.generation_run_id

      const [appEventsResult, runtimeEventsResult] = await Promise.all([
        supabase
          .from('app_deployment_events')
          .select('id, app_deployment_id, generation_run_id, event_type, severity, message, provider, external_id, payload, created_at')
          .eq('app_deployment_id', appDeploymentId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('runtime_events')
          .select('id, agent_id, event_type, severity, payload, created_at')
          .eq('org_id', app.org_id)
          .order('created_at', { ascending: false })
          .limit(Math.min(limit * 5, 500)),
      ])

      if (appEventsResult.error) throw appEventsResult.error
      if (runtimeEventsResult.error) throw runtimeEventsResult.error

      const appItems = ((appEventsResult.data ?? []) as DbAppDeploymentEvent[])
        .map(appEventToFeedItem)

      const runtimeItems = ((runtimeEventsResult.data ?? []) as DbRuntimeEvent[])
        .flatMap((event) => {
          const payload = safeMetadata(event.payload)
          const matchedBy = hasAppReference(payload, appDeploymentId)
            ? 'app_deployment_id'
            : hasGenerationReference(payload, generationRunId)
              ? 'generation_run_id'
              : hasAssistantReference(event, assistantIds)
                ? 'assistant_id'
                : null
          return matchedBy ? [runtimeEventToFeedItem(event, matchedBy)] : []
        })

      const feed = [...appItems, ...runtimeItems]
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
        .slice(0, limit)

      recordAppServiceMetric('operator_runtime_agentops_feed_read', 1, {
        stage: 'runtime.operator',
        operation: 'listAppAgentOpsFeed',
        orgId: app.org_id,
        projectId: app.project_id,
        appDeploymentId,
        generationRunId,
        appRuntimeApiVersion: 'v1',
        slug: app.slug,
      }, {
        returned_events: feed.length,
        app_event_count: appItems.length,
        runtime_event_count: runtimeItems.length,
      })

      return feed
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        context: {
          operation: 'listAppAgentOpsFeed',
          appDeploymentId,
        },
        tags: { layer: 'app-service', feature: 'agentops' },
      })
      throw new AppServiceError('internal_error', 'Failed to read app AgentOps feed.', 500)
    }
  })
}
