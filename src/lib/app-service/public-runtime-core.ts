export type PublicRuntimeRequestKind =
  | 'config'
  | 'discovery'
  | 'status'
  | 'session'
  | 'chat'
  | 'lead'
  | 'feedback'
  | 'action'
  | 'preflight'

export interface PublicRuntimeAccess {
  kind: PublicRuntimeRequestKind
  origin: string | null
  requestUrl: string
  token: string | null
  countRequest: boolean
  requestIdentifier: string | null
  turnstileToken: string | null
}

export type PublicRuntimeAbuseScope = 'app' | 'org' | 'ip' | 'session'

export interface PublicRuntimeRateLimitConfig {
  maxRequests: number
  windowMs: number
}

export const DEFAULT_PUBLIC_RUNTIME_RATE_LIMITS: Record<PublicRuntimeAbuseScope, PublicRuntimeRateLimitConfig> = {
  app: { maxRequests: 600, windowMs: 60_000 },
  org: { maxRequests: 3_000, windowMs: 60_000 },
  ip: { maxRequests: 60, windowMs: 60_000 },
  session: { maxRequests: 30, windowMs: 60_000 },
}

const ACCOUNTED_KINDS = new Set<PublicRuntimeRequestKind>([
  'session',
  'chat',
  'lead',
  'feedback',
  'action',
])

export function buildPublicRuntimeAccess(
  request: Request,
  kind: PublicRuntimeRequestKind,
  countRequest = shouldCountPublicRuntimeRequest(kind),
  options: {
    requestIdentifier?: string | null
  } = {},
): PublicRuntimeAccess {
  return {
    kind,
    origin: normalizeOrigin(request.headers.get('origin')),
    requestUrl: request.url,
    token: bearerTokenFromAuthorization(request.headers.get('authorization')),
    countRequest,
    requestIdentifier: options.requestIdentifier ?? null,
    turnstileToken: turnstileTokenFromHeaders(request.headers),
  }
}

export function turnstileTokenFromHeaders(headers: Headers): string | null {
  return headers.get('x-turnstile-token')?.trim()
    || headers.get('cf-turnstile-response')?.trim()
    || null
}

export function bearerTokenFromAuthorization(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

export function shouldCountPublicRuntimeRequest(kind: PublicRuntimeRequestKind): boolean {
  return ACCOUNTED_KINDS.has(kind)
}

export function normalizeOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null
  try {
    const parsed = new URL(origin)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

export function originFromUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith('/')) return null
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

export function isSameOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true
  return origin === originFromUrl(requestUrl)
}

export function publicRuntimeDayRange(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function publicRuntimeMonthRange(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

export function manifestNumberLimit(
  manifest: Record<string, unknown>,
  key: string,
): number | null {
  const limits = manifest.limits
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return null
  const value = (limits as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function integerEnv(env: Record<string, string | undefined>, key: string): number | null {
  const value = env[key]?.trim()
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function manifestRateLimitOverride(
  manifest: Record<string, unknown>,
  scope: PublicRuntimeAbuseScope,
): number | null {
  if (scope === 'app') return manifestNumberLimit(manifest, 'public_app_requests_per_minute')
  if (scope === 'org') return manifestNumberLimit(manifest, 'public_org_requests_per_minute')
  if (scope === 'ip') return manifestNumberLimit(manifest, 'public_ip_requests_per_minute')
  return manifestNumberLimit(manifest, 'public_session_requests_per_minute')
}

export function publicRuntimeRateLimitConfig(
  manifest: Record<string, unknown>,
  scope: PublicRuntimeAbuseScope,
  env: Record<string, string | undefined> = process.env,
): PublicRuntimeRateLimitConfig {
  const defaultConfig = DEFAULT_PUBLIC_RUNTIME_RATE_LIMITS[scope]
  const envMax = integerEnv(env, `APP_SERVICE_PUBLIC_${scope.toUpperCase()}_RATE_LIMIT`)
  const envWindow = integerEnv(env, 'APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS')
  const manifestMax = manifestRateLimitOverride(manifest, scope)

  return {
    maxRequests: Math.max(1, Math.floor(manifestMax ?? envMax ?? defaultConfig.maxRequests)),
    windowMs: Math.max(1_000, Math.floor(envWindow ?? defaultConfig.windowMs)),
  }
}

export function publicRuntimeRateLimitKey(params: {
  appDeploymentId: string
  kind: PublicRuntimeRequestKind
  scope: PublicRuntimeAbuseScope
  identifier: string
}): string {
  return [
    'app-service',
    'public-runtime',
    params.appDeploymentId,
    params.kind,
    params.scope,
    params.identifier,
  ].join(':')
}

export function visitorSessionIdFromPublicRuntimeInput(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = (input as Record<string, unknown>).visitor_session_id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function turnstileTokenFromPublicRuntimeInput(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const direct = record.turnstile_token ?? record.turnstileToken ?? record.cf_turnstile_response
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  for (const containerKey of ['metadata', 'fields', 'input']) {
    const container = record[containerKey]
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue
    const nested = container as Record<string, unknown>
    const value = nested.turnstile_token ?? nested.turnstileToken ?? nested.cf_turnstile_response
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

export function publicRuntimeTurnstileRequiredKinds(
  env: Record<string, string | undefined> = process.env,
): Set<PublicRuntimeRequestKind> {
  const raw = env.APP_SERVICE_TURNSTILE_REQUIRED_KINDS?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((kind) => kind.trim())
      .filter((kind): kind is PublicRuntimeRequestKind => (
        kind === 'session'
        || kind === 'chat'
        || kind === 'lead'
        || kind === 'feedback'
        || kind === 'action'
      )),
  )
}

export function publicRuntimeRequiresTurnstile(
  kind: PublicRuntimeRequestKind,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return publicRuntimeTurnstileRequiredKinds(env).has(kind)
}

export function publicRuntimeEventType(kind: PublicRuntimeRequestKind): string | null {
  if (kind === 'session') return 'public_session_created'
  if (kind === 'chat') return 'public_chat_completed'
  if (kind === 'lead') return 'public_lead_submitted'
  if (kind === 'feedback') return 'public_feedback_submitted'
  if (kind === 'action') return 'public_action_requested'
  return null
}

export const ACCOUNTED_PUBLIC_RUNTIME_EVENT_TYPES = [
  'public_session_created',
  'public_chat_completed',
  'public_lead_submitted',
  'public_feedback_submitted',
  'public_feedback_reported',
  'public_action_requested',
] as const
