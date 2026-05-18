/**
 * Worker tracing helpers.
 *
 * IMPORTANT: Keep this file self-contained so integration tests can import
 * crypto/memory modules without requiring monorepo package resolution
 * for @lucid/observability.
 */

import { createHash } from 'node:crypto'
import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api'

const SERVICE_NAMES = { LUCID_WORKER: 'lucid-worker' } as const
const SERVICE_NAMESPACE = 'lucid'

type AttrValue = string | number | boolean

let hashSalt = 'lucid-otel-v1'
let hashConfigured = false

export function configureHashSalt(salt?: string, env?: string): void {
  if (!salt && env === 'production') {
    throw new Error('[otel] OTEL_HASH_SALT must be set in production')
  }
  hashSalt = salt || 'lucid-otel-v1'
  hashConfigured = true
}

export function hashForTelemetry(value: string): string {
  if (!hashConfigured) {
    console.warn('[otel] hashForTelemetry called before configureHashSalt(). Using default salt.')
    hashConfigured = true
  }
  return createHash('sha256').update(`${hashSalt}:${value}`).digest('hex').slice(0, 32)
}

const ALLOWED_ATTRIBUTE_KEYS = new Set<string>([
  'lucid.tenant_key_hash',
  'lucid.session_key_hash',
  'lucid.user_key_hash',
  'lucid.run_id',
  'lucid.conversation_id',
  'lucid.message_id',
  'lucid.channel_type',
  'lucid.llm.provider',
  'lucid.llm.model',
  'lucid.llm.attempt',
  'lucid.llm.status_code',
  'lucid.llm.duration_ms',
  'lucid.llm.error_type',
  'lucid.tool.name',
  'lucid.tool.category',
  'lucid.tool.allowed',
  'lucid.tool.duration_ms',
  'lucid.tool.error_type',
  'lucid.encrypt.mode',
  'lucid.encrypt.payload_bytes',
  'lucid.encrypt.algo',
  'lucid.encrypt.key_version',
  'lucid.memory.extracted_count',
  'lucid.memory.stored_count',
  'lucid.memory.embed_calls',
  'lucid.plugin.slug',
  'lucid.plugin.tool',
  'lucid.plugin.duration_ms',
  'lucid.plugin.execution_mode',
  'lucid.plugin.fallback',
  'lucid.plugin.error_type',
  'lucid.subagent.parent_run_id',
  'lucid.subagent.child_run_id',
  'lucid.subagent.depth',
  'lucid.subagent.duration_ms',
  'lucid.subagent.tool_calls',
  'lucid.scheduler.task_id',
  'lucid.scheduler.task_name',
  'lucid.scheduler.cron_expression',
  'lucid.scheduler.run_count',
  'lucid.scheduler.retry_count',
  'lucid.scheduler.status',
  'lucid.messaging.source_assistant_id',
  'lucid.messaging.target_assistant_id',
  'lucid.messaging.channel_id',
  'http.method',
  'http.route',
  'http.status_code',
  'http.duration_ms',
  'db.system',
  'db.operation',
  'db.duration_ms',
  'error.type',
  'otel.status_code',
  'lucid.pulse.event_type',
  'lucid.pulse.priority',
  'lucid.pulse.agent_id',
  'lucid.pulse.event_id',
  'lucid.pulse.run_id',
  'lucid.pulse.attempt',
  'lucid.pulse.outcome',
  'lucid.pulse.duration_ms',
  'lucid.runtime.engine',
  'lucid.runtime.flavor',
  'lucid.runtime.dedicated_transport_mode',
  'lucid.runtime.orchestration_mode',
])

function filterAttributes(attrs: Record<string, AttrValue>): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (ALLOWED_ATTRIBUTE_KEYS.has(k)) out[k] = v
  }
  return out
}

export function safeSetAttribute(span: Span, key: string, value: AttrValue): void {
  if (ALLOWED_ATTRIBUTE_KEYS.has(key)) span.setAttribute(key, value)
}

export function safeSetAttributes(span: Span, attrs: Record<string, AttrValue>): void {
  span.setAttributes(filterAttributes(attrs))
}

export function sanitizeErrorForTelemetry(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err))
  const dangerousProps = ['response', 'data', 'body', 'cause', 'config'] as const
  for (const prop of dangerousProps) {
    if (prop in err) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (err as any)[prop]
      } catch {
        const safe = new Error(err.message)
        safe.name = err.name
        safe.stack = err.stack
        return safe
      }
    }
  }
  return err
}

export function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown_error'
  const msg = err.message
  const status = msg.match(/\((\d{3})\)/)?.[1]
  if (status) return `status_${status}`
  if (msg.includes('timeout') || msg.includes('AbortError')) return 'timeout'
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) return 'network_error'
  return 'provider_error'
}

export interface TracePropagationPolicy {
  internalHosts?: string[]
  internalHostSuffixes?: string[]
  allowLoopback?: boolean
}

export function shouldPropagateTraceContext(target: string | URL, policy: TracePropagationPolicy = {}): boolean {
  const allowLoopback = policy.allowLoopback ?? true
  const internalHosts = (policy.internalHosts ?? []).map((h) => h.toLowerCase())
  const suffixes = (policy.internalHostSuffixes ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean)

  let hostname = ''
  try {
    hostname = (typeof target === 'string' ? new URL(target) : target).hostname.toLowerCase()
  } catch {
    return false
  }

  if (allowLoopback && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')) return true
  if (internalHosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) return true
  if (suffixes.some((s) => hostname === s.replace(/^\./, '') || hostname.endsWith(s.startsWith('.') ? s : `.${s}`))) return true
  return false
}

export function injectTraceContextForTarget(
  headers: Record<string, string>,
  target: string | URL,
  policy: TracePropagationPolicy = {},
): Record<string, string> {
  if (!shouldPropagateTraceContext(target, policy)) return headers
  propagation.inject(context.active(), headers)
  return headers
}

export function getCorrelationFields(): { trace_id: string; span_id: string } {
  const active = trace.getActiveSpan()
  if (!active) return { trace_id: '', span_id: '' }
  const sc = active.spanContext()
  return { trace_id: sc.traceId, span_id: sc.spanId }
}

let sdk: { shutdown: () => Promise<void> } | null = null

function getLucidEnv(): 'production' | 'staging' | 'development' | 'test' {
  const env = process.env.LUCID_ENV || process.env.NODE_ENV || 'development'
  if (env === 'prod') return 'production'
  if (env === 'dev') return 'development'
  if (env === 'stage' || env === 'preview') return 'staging'
  return env as 'production' | 'staging' | 'development' | 'test'
}

export async function initTracing(): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') return

  const mods = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/sdk-trace-base'),
  ]).catch((err) => {
    console.warn(`[otel] Tracing requested but SDK deps are unavailable: ${err instanceof Error ? err.message : String(err)}`)
    return null
  })

  if (!mods) return
  const [{ NodeSDK }, { OTLPTraceExporter }, { resourceFromAttributes }, semantic, { BatchSpanProcessor }] = mods
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = semantic

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
  const serviceName = process.env.OTEL_SERVICE_NAME || SERVICE_NAMES.LUCID_WORKER
  const environment = getLucidEnv()
  configureHashSalt(process.env.OTEL_HASH_SALT, environment)

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.SENTRY_RELEASE || process.env.npm_package_version || '1.0.0',
    'deployment.environment.name': environment,
    'service.namespace': SERVICE_NAMESPACE,
  })

  const runtimeSdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  runtimeSdk.start()
  sdk = runtimeSdk

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(() => undefined)
  })
}

export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAMES.LUCID_WORKER)
}

export function startInboundSpan(attrs: {
  tenantKey: string
  channelType: string
  conversationId: string
  runId: string
}): Span {
  return getTracer().startSpan('inbound.pipeline', {
    attributes: {
      'lucid.tenant_key_hash': hashForTelemetry(attrs.tenantKey),
      'lucid.channel_type': attrs.channelType,
      'lucid.conversation_id': attrs.conversationId,
      'lucid.run_id': attrs.runId,
    },
  })
}

export function startLlmCallSpan(attrs: {
  provider: string
  model: string
  attempt: number
  statusCode?: number
  durationMs?: number
  errorType?: string
}, parentSpan?: Span): Span {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active()
  const a: Record<string, AttrValue> = {
    'lucid.llm.provider': attrs.provider,
    'lucid.llm.model': attrs.model,
    'lucid.llm.attempt': attrs.attempt,
  }
  if (attrs.statusCode !== undefined) a['lucid.llm.status_code'] = attrs.statusCode
  if (attrs.durationMs !== undefined) a['lucid.llm.duration_ms'] = attrs.durationMs
  if (attrs.errorType) a['lucid.llm.error_type'] = attrs.errorType
  return getTracer().startSpan('llm.call', { attributes: a }, ctx)
}

export function startToolExecuteSpan(attrs: {
  toolName: string
  runId: string
  category?: string
  allowed?: boolean
}, parentSpan?: Span): Span {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active()
  const a: Record<string, AttrValue> = {
    'lucid.tool.name': attrs.toolName,
    'lucid.run_id': attrs.runId,
  }
  if (attrs.category) a['lucid.tool.category'] = attrs.category
  if (attrs.allowed !== undefined) a['lucid.tool.allowed'] = attrs.allowed
  return getTracer().startSpan('tool.execute', { attributes: a }, ctx)
}

export function startEncryptSpan(attrs: {
  tenantKey: string
  messageId: string
  mode?: string
  payloadBytes?: number
  algo?: string
  keyVersion?: string
}, parentSpan?: Span): Span {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active()
  const a: Record<string, AttrValue> = {
    'lucid.tenant_key_hash': hashForTelemetry(attrs.tenantKey),
    'lucid.message_id': attrs.messageId,
  }
  if (attrs.mode) a['lucid.encrypt.mode'] = attrs.mode
  if (attrs.payloadBytes !== undefined) a['lucid.encrypt.payload_bytes'] = attrs.payloadBytes
  if (attrs.algo) a['lucid.encrypt.algo'] = attrs.algo
  if (attrs.keyVersion) a['lucid.encrypt.key_version'] = attrs.keyVersion
  return getTracer().startSpan('encrypt.message', { attributes: a }, ctx)
}

export function startMemoryExtractSpan(attrs: {
  tenantKey: string
  conversationId: string
  extractedCount?: number
  storedCount?: number
  embedCalls?: number
}, parentSpan?: Span): Span {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active()
  const a: Record<string, AttrValue> = {
    'lucid.tenant_key_hash': hashForTelemetry(attrs.tenantKey),
    'lucid.conversation_id': attrs.conversationId,
  }
  if (attrs.extractedCount !== undefined) a['lucid.memory.extracted_count'] = attrs.extractedCount
  if (attrs.storedCount !== undefined) a['lucid.memory.stored_count'] = attrs.storedCount
  if (attrs.embedCalls !== undefined) a['lucid.memory.embed_calls'] = attrs.embedCalls
  return getTracer().startSpan('memory.extract', { attributes: a }, ctx)
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, AttrValue>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = getTracer().startSpan(name, { attributes: filterAttributes(attrs) })
  try {
    const result = await fn(span)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'unknown_error' })
    span.recordException(err instanceof Error ? err : new Error(String(err)))
    throw err
  } finally {
    span.end()
  }
}

export function createExpressTracingMiddleware() {
  return (req: any, res: any, next: any) => {
    const span = getTracer().startSpan('http.request', {
      attributes: filterAttributes({
        'http.method': req.method,
        'http.route': req.path,
      }),
    })
    const t0 = Date.now()

    const originalEnd = res.end
    res.end = function (...args: any[]) {
      span.setAttribute('http.status_code', res.statusCode)
      span.setAttribute('http.duration_ms', Date.now() - t0)
      span.setStatus({ code: res.statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK })
      span.end()
      return originalEnd.apply(this, args)
    }

    next()
  }
}

export async function withDbSpan<T>(
  operationName: string,
  fn: () => PromiseLike<T>,
): Promise<T> {
  const span = getTracer().startSpan('db.query', {
    attributes: filterAttributes({
      'db.system': 'postgresql',
      'db.operation': operationName,
    }),
  })
  const t0 = Date.now()
  try {
    const result = await fn()
    span.setAttribute('db.duration_ms', Date.now() - t0)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.setAttribute('db.duration_ms', Date.now() - t0)
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'db_error' })
    span.recordException(err instanceof Error ? err : new Error(String(err)))
    throw err
  } finally {
    span.end()
  }
}

export { SpanStatusCode }
export type { Span }
