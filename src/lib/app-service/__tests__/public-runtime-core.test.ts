import { describe, expect, it } from 'vitest'
import {
  ACCOUNTED_PUBLIC_RUNTIME_EVENT_TYPES,
  bearerTokenFromAuthorization,
  buildPublicRuntimeAccess,
  DEFAULT_PUBLIC_RUNTIME_RATE_LIMITS,
  isSameOrigin,
  manifestNumberLimit,
  normalizeOrigin,
  originFromUrl,
  publicRuntimeRateLimitConfig,
  publicRuntimeRateLimitKey,
  publicRuntimeRequiresTurnstile,
  publicRuntimeTurnstileRequiredKinds,
  publicRuntimeDayRange,
  publicRuntimeEventType,
  publicRuntimeMonthRange,
  shouldCountPublicRuntimeRequest,
  turnstileTokenFromPublicRuntimeInput,
  visitorSessionIdFromPublicRuntimeInput,
} from '../public-runtime-core'

describe('public runtime core', () => {
  it('normalizes request origins and marks billable public request kinds', () => {
    const configRequest = new Request('https://runtime.example.com/api/app-runtime/v1/public/apps/demo/config', {
      headers: { origin: 'https://App.Example.com:443/dashboard' },
    })
    const chatRequest = new Request('https://runtime.example.com/api/app-runtime/v1/public/apps/demo/chat', {
      headers: {
        origin: 'https://app.example.com',
        authorization: 'Bearer lucid_pub_demo',
        'x-turnstile-token': 'turnstile-demo',
      },
    })

    expect(buildPublicRuntimeAccess(configRequest, 'config')).toMatchObject({
      kind: 'config',
      origin: 'https://app.example.com',
      countRequest: false,
    })
    expect(buildPublicRuntimeAccess(chatRequest, 'chat')).toMatchObject({
      kind: 'chat',
      origin: 'https://app.example.com',
      token: 'lucid_pub_demo',
      countRequest: true,
      turnstileToken: 'turnstile-demo',
    })
    expect(buildPublicRuntimeAccess(chatRequest, 'chat', false).countRequest).toBe(false)
  })

  it('recognizes same-origin requests without requiring a CORS allowlist hit', () => {
    expect(normalizeOrigin('https://App.Example.com:443/path')).toBe('https://app.example.com')
    expect(normalizeOrigin('not a url')).toBeNull()
    expect(originFromUrl('/relative/path')).toBeNull()
    expect(originFromUrl('https://runtime.example.com/apps/demo?preview=true')).toBe('https://runtime.example.com')
    expect(isSameOrigin(null, 'https://runtime.example.com/apps/demo')).toBe(true)
    expect(isSameOrigin('https://runtime.example.com', 'https://runtime.example.com/apps/demo')).toBe(true)
    expect(isSameOrigin('https://other.example.com', 'https://runtime.example.com/apps/demo')).toBe(false)
  })

  it('derives UTC accounting windows for daily and monthly public runtime limits', () => {
    const now = new Date('2026-04-29T18:34:15.000Z')

    expect(publicRuntimeDayRange(now)).toEqual({
      start: '2026-04-29T00:00:00.000Z',
      end: '2026-04-30T00:00:00.000Z',
    })
    expect(publicRuntimeMonthRange(now)).toEqual({
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-05-01T00:00:00.000Z',
    })
  })

  it('reads numeric manifest limits and maps accounted event types', () => {
    const manifest = {
      limits: {
        public_requests_per_day: 500,
        monthly_cost_cents: '1000',
        infinite: Number.POSITIVE_INFINITY,
      },
    }

    expect(manifestNumberLimit(manifest, 'public_requests_per_day')).toBe(500)
    expect(manifestNumberLimit(manifest, 'monthly_cost_cents')).toBeNull()
    expect(manifestNumberLimit(manifest, 'infinite')).toBeNull()
    expect(manifestNumberLimit({}, 'public_requests_per_day')).toBeNull()
    expect(publicRuntimeEventType('session')).toBe('public_session_created')
    expect(publicRuntimeEventType('chat')).toBe('public_chat_completed')
    expect(publicRuntimeEventType('lead')).toBe('public_lead_submitted')
    expect(publicRuntimeEventType('feedback')).toBe('public_feedback_submitted')
    expect(publicRuntimeEventType('action')).toBe('public_action_requested')
    expect(publicRuntimeEventType('status')).toBeNull()
    expect(shouldCountPublicRuntimeRequest('preflight')).toBe(false)
    expect(shouldCountPublicRuntimeRequest('feedback')).toBe(true)
    expect(ACCOUNTED_PUBLIC_RUNTIME_EVENT_TYPES).toContain('public_feedback_reported')
    expect(bearerTokenFromAuthorization('Bearer lucid_pub_token')).toBe('lucid_pub_token')
    expect(bearerTokenFromAuthorization('Basic abc')).toBeNull()
  })

  it('derives scoped public runtime abuse rate-limit keys and configs', () => {
    const manifest = {
      limits: {
        public_app_requests_per_minute: 12,
        public_org_requests_per_minute: 120,
        public_ip_requests_per_minute: 6,
      },
    }

    expect(publicRuntimeRateLimitConfig(manifest, 'app', {
      APP_SERVICE_PUBLIC_APP_RATE_LIMIT: '100',
      APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS: '30000',
    })).toEqual({ maxRequests: 12, windowMs: 30_000 })
    expect(publicRuntimeRateLimitConfig(manifest, 'ip', {
      APP_SERVICE_PUBLIC_IP_RATE_LIMIT: '100',
    }).maxRequests).toBe(6)
    expect(publicRuntimeRateLimitConfig(manifest, 'org', {
      APP_SERVICE_PUBLIC_ORG_RATE_LIMIT: '1000',
    }).maxRequests).toBe(120)
    expect(publicRuntimeRateLimitConfig({}, 'session', {
      APP_SERVICE_PUBLIC_SESSION_RATE_LIMIT: '9',
    })).toEqual({ maxRequests: 9, windowMs: DEFAULT_PUBLIC_RUNTIME_RATE_LIMITS.session.windowMs })
    expect(publicRuntimeRateLimitConfig({
      limits: { public_app_requests_per_minute: 0 },
    }, 'app', {
      APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS: '250',
    })).toEqual({ maxRequests: 1, windowMs: 1_000 })
    expect(publicRuntimeRateLimitKey({
      appDeploymentId: 'app-1',
      kind: 'chat',
      scope: 'ip',
      identifier: 'fingerprint',
    })).toBe('app-service:public-runtime:app-1:chat:ip:fingerprint')
  })

  it('extracts visitor session and Turnstile proof hints from public requests', () => {
    expect(visitorSessionIdFromPublicRuntimeInput({
      visitor_session_id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
    })).toBe('2d34bcc7-5db8-4e80-a681-5b158c83193d')
    expect(visitorSessionIdFromPublicRuntimeInput({ visitor_session_id: '' })).toBeNull()

    expect(turnstileTokenFromPublicRuntimeInput({ turnstile_token: 'direct' })).toBe('direct')
    expect(turnstileTokenFromPublicRuntimeInput({ metadata: { turnstileToken: 'nested' } })).toBe('nested')
    expect(turnstileTokenFromPublicRuntimeInput({ fields: { cf_turnstile_response: 'field' } })).toBe('field')
    expect(turnstileTokenFromPublicRuntimeInput({})).toBeNull()
  })

  it('parses Turnstile-required public runtime kinds from env', () => {
    const env = {
      APP_SERVICE_TURNSTILE_REQUIRED_KINDS: 'lead,chat,invalid, action ',
    }

    expect([...publicRuntimeTurnstileRequiredKinds(env)]).toEqual(['lead', 'chat', 'action'])
    expect(publicRuntimeRequiresTurnstile('lead', env)).toBe(true)
    expect(publicRuntimeRequiresTurnstile('status', env)).toBe(false)
    expect(publicRuntimeRequiresTurnstile('lead', {})).toBe(false)
  })
})
