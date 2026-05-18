import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from '@opentelemetry/api'
import { APP_SERVICE_REDACTED, redactAppServiceMetadata } from './security-redaction'

export type AppServiceTelemetryStage =
  | 'agentops'
  | 'compiler'
  | 'deploy'
  | 'eval'
  | 'generation'
  | 'planner'
  | 'provider.sync'
  | 'provider.v0'
  | 'provider.vercel'
  | 'runtime.operator'
  | 'runtime.public'
  | 'sandbox'

export interface AppServiceTelemetryContext {
  stage: AppServiceTelemetryStage
  operation?: string
  requestId?: string | null
  orgId?: string | null
  projectId?: string | null
  appDeploymentId?: string | null
  generationRunId?: string | null
  frontendGenerationId?: string | null
  externalDeploymentId?: string | null
  appRuntimeApiVersion?: string | null
  visitorSessionId?: string | null
  operatorUserId?: string | null
  agentopsTraceId?: string | null
  provider?: string | null
  slug?: string | null
}

export type AppServiceLogLevel = 'debug' | 'info' | 'warn' | 'error'

type MaybePromise<T> = T | Promise<T>

const TRACER_NAME = 'lucid.app-service'
const LOG_ENV_FLAG = 'APP_SERVICE_STRUCTURED_LOGS'

const TELEMETRY_ATTRIBUTE_KEYS: Array<[keyof AppServiceTelemetryContext, string]> = [
  ['stage', 'app.service.stage'],
  ['operation', 'app.service.operation'],
  ['requestId', 'request.id'],
  ['orgId', 'app.service.org_id'],
  ['projectId', 'app.service.project_id'],
  ['appDeploymentId', 'app.service.deployment_id'],
  ['generationRunId', 'app.service.generation_run_id'],
  ['frontendGenerationId', 'app.service.frontend_generation_id'],
  ['externalDeploymentId', 'app.service.external_deployment_id'],
  ['appRuntimeApiVersion', 'app.runtime.api_version'],
  ['visitorSessionId', 'app.runtime.visitor_session_id'],
  ['operatorUserId', 'app.runtime.operator_user_id'],
  ['agentopsTraceId', 'agentops.trace_id'],
  ['provider', 'app.service.provider'],
  ['slug', 'app.service.slug'],
]

const SENTRY_TAG_KEYS: Array<[keyof AppServiceTelemetryContext, string]> = [
  ['stage', 'app_service_stage'],
  ['operation', 'operation'],
  ['orgId', 'org_id'],
  ['projectId', 'project_id'],
  ['appDeploymentId', 'app_deployment_id'],
  ['generationRunId', 'generation_run_id'],
  ['frontendGenerationId', 'frontend_generation_id'],
  ['externalDeploymentId', 'external_deployment_id'],
  ['appRuntimeApiVersion', 'app_runtime_api_version'],
  ['operatorUserId', 'operator_user_id'],
  ['agentopsTraceId', 'agentops_trace_id'],
  ['provider', 'provider'],
  ['slug', 'slug'],
]

function compactString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function durationMs(start: number): number {
  return Math.max(0, Date.now() - start)
}

function shouldEmitStructuredLogs(): boolean {
  if (process.env.VITEST && process.env[LOG_ENV_FLAG] !== 'true') return false
  return process.env[LOG_ENV_FLAG] !== 'false'
}

function consoleForLevel(level: AppServiceLogLevel) {
  if (level === 'debug') return console.debug
  if (level === 'warn') return console.warn
  if (level === 'error') return console.error
  return console.info
}

function sanitizeLogRecord(record: Record<string, unknown>): Record<string, unknown> {
  return redactAppServiceMetadata(record)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

export function appServiceTelemetryAttributes(
  context: AppServiceTelemetryContext,
  extra: Record<string, unknown> = {},
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {}

  for (const [key, attributeName] of TELEMETRY_ATTRIBUTE_KEYS) {
    const value = compactString(context[key])
    if (value) attributes[attributeName] = value
  }

  for (const [key, value] of Object.entries(redactAppServiceMetadata(extra))) {
    if (typeof value === 'string' && value.trim()) attributes[`app.service.${key}`] = value
    if (typeof value === 'number' && Number.isFinite(value)) attributes[`app.service.${key}`] = value
    if (typeof value === 'boolean') attributes[`app.service.${key}`] = value
  }

  return attributes
}

export function appServiceSentryTags(context: AppServiceTelemetryContext): Record<string, string> {
  const tags: Record<string, string> = {
    layer: 'app-service',
    feature: context.stage,
  }

  for (const [key, tagName] of SENTRY_TAG_KEYS) {
    const value = compactString(context[key])
    if (value) tags[tagName] = value
  }

  return tags
}

export function appServiceErrorContext(
  operation: string,
  context: AppServiceTelemetryContext,
  extra: Record<string, unknown> = {},
) {
  return {
    context: redactAppServiceMetadata({
      operation,
      stage: context.stage,
      requestId: compactString(context.requestId),
      orgId: compactString(context.orgId),
      projectId: compactString(context.projectId),
      appDeploymentId: compactString(context.appDeploymentId),
      generationRunId: compactString(context.generationRunId),
      frontendGenerationId: compactString(context.frontendGenerationId),
      externalDeploymentId: compactString(context.externalDeploymentId),
      appRuntimeApiVersion: compactString(context.appRuntimeApiVersion),
      visitorSessionId: compactString(context.visitorSessionId),
      operatorUserId: compactString(context.operatorUserId),
      agentopsTraceId: compactString(context.agentopsTraceId),
      provider: compactString(context.provider),
      slug: compactString(context.slug),
      ...extra,
    }),
    tags: appServiceSentryTags({ ...context, operation }),
  }
}

export function logAppServiceTelemetry(
  level: AppServiceLogLevel,
  message: string,
  context: AppServiceTelemetryContext,
  extra: Record<string, unknown> = {},
): void {
  if (!shouldEmitStructuredLogs()) return

  const log = consoleForLevel(level)
  const record = sanitizeLogRecord({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'lucid-app-service',
    stage: context.stage,
    operation: context.operation ?? null,
    request_id: context.requestId ?? null,
    org_id: context.orgId ?? null,
    project_id: context.projectId ?? null,
    app_deployment_id: context.appDeploymentId ?? null,
    generation_run_id: context.generationRunId ?? null,
    frontend_generation_id: context.frontendGenerationId ?? null,
    external_deployment_id: context.externalDeploymentId ?? null,
    app_runtime_api_version: context.appRuntimeApiVersion ?? null,
    visitor_session_id: context.visitorSessionId ?? null,
    operator_user_id: context.operatorUserId ?? null,
    agentops_trace_id: context.agentopsTraceId ?? null,
    provider: context.provider ?? null,
    slug: context.slug ?? null,
    ...extra,
  })

  log(JSON.stringify(record))
}

export function recordAppServiceMetric(
  name: string,
  value: number,
  context: AppServiceTelemetryContext,
  attributes: Record<string, unknown> = {},
): void {
  logAppServiceTelemetry('info', 'app_service_metric', context, {
    metric_name: name,
    metric_value: value,
    attributes,
  })
}

export function withAppServiceSpan<T>(
  name: string,
  context: AppServiceTelemetryContext,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, unknown>,
): Promise<T>
export function withAppServiceSpan<T>(
  name: string,
  context: AppServiceTelemetryContext,
  fn: (span: Span) => T,
  attributes?: Record<string, unknown>,
): T
export function withAppServiceSpan<T>(
  name: string,
  context: AppServiceTelemetryContext,
  fn: (span: Span) => MaybePromise<T>,
  attributes: Record<string, unknown> = {},
): MaybePromise<T> {
  const startedAt = Date.now()
  const spanContext = {
    ...context,
    operation: context.operation ?? name,
  }

  return trace.getTracer(TRACER_NAME).startActiveSpan(
    name,
    {
      kind: SpanKind.INTERNAL,
      attributes: appServiceTelemetryAttributes(spanContext, attributes),
    },
    (span) => {
      logAppServiceTelemetry('info', 'app_service_span_started', spanContext, {
        span_name: name,
        attributes,
      })

      const complete = (result: T): T => {
        const ms = durationMs(startedAt)
        span.setAttribute('app.service.duration_ms', ms)
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        logAppServiceTelemetry('info', 'app_service_span_completed', spanContext, {
          span_name: name,
          duration_ms: ms,
        })
        return result
      }

      const fail = (error: unknown): never => {
        const ms = durationMs(startedAt)
        const message = errorMessage(error)
        span.setAttribute('app.service.duration_ms', ms)
        span.setStatus({ code: SpanStatusCode.ERROR, message })
        if (error instanceof Error) span.recordException(error)
        span.end()
        logAppServiceTelemetry('error', 'app_service_span_failed', spanContext, {
          span_name: name,
          duration_ms: ms,
          error_message: message,
        })
        throw error
      }

      try {
        const result = fn(span)
        if (result && typeof (result as Promise<T>).then === 'function') {
          return (result as Promise<T>).then(complete, fail)
        }
        return complete(result as T)
      } catch (error) {
        return fail(error)
      }
    },
  )
}

export function redactedTelemetryValue(): string {
  return APP_SERVICE_REDACTED
}
