/**
 * Centralized Nango HTTP client with timeout, retry, and rate-limit handling.
 *
 * Every outbound call from Next.js API routes to the Nango backend or
 * Nango proxy (provider APIs) should go through this module.
 *
 * Features:
 *   - AbortSignal-based timeout (default 30s, configurable)
 *   - Exponential backoff retry on 429 / 5xx (default 3 attempts)
 *   - Structured error capture via ErrorService
 *   - Usage tracking callback for connection stats
 */

import { ErrorService } from '@/lib/errors/error-service'
import { Agent } from 'undici'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 1_000
const BACKOFF_MULTIPLIER = 2

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^['"]|['"]$/g, '').replace(/\/+$/g, '')
}

const OAUTH_API_URL = normalizeEnvValue(process.env.NEXT_PUBLIC_OAUTH_API_URL) || 'http://localhost:3001'
const NANGO_API_URL = normalizeEnvValue(process.env.NANGO_API_BASE) || `${OAUTH_API_URL}/nango`
const NANGO_HOST = normalizeEnvValue(process.env.NANGO_HOST) || NANGO_API_URL
const NANGO_SECRET_KEY = normalizeEnvValue(process.env.NANGO_SECRET_KEY)

const SHARED_FETCH_DISPATCHER = new Agent({
  connect: {
    timeout: 10_000,
  },
  autoSelectFamily: true,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NangoFetchOptions {
  /** Absolute URL or path relative to NANGO_API_URL */
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  /** Timeout in ms (default 30 000) */
  timeoutMs?: number
  /** Max retry attempts on transient errors (default 3) */
  maxRetries?: number
  /** Human-readable label for logs/Sentry (e.g. "session-create") */
  label?: string
  /** Skip retry entirely (e.g. for webhook → Nango calls where latency matters) */
  skipRetry?: boolean
}

export interface NangoFetchResult<T = unknown> {
  ok: boolean
  status: number
  data: T
  headers: Headers
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function buildAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

export function getOAuthApiBaseUrl(): string {
  return OAUTH_API_URL
}

export function getNangoApiBaseUrl(): string {
  return NANGO_API_URL
}

export function summarizeNangoFailure(data: unknown): string | null {
  if (typeof data === 'string') {
    const text = data
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return null
    if (/502:?\s*bad gateway|bad gateway/i.test(text)) {
      return 'OAuth backend returned 502 Bad Gateway'
    }
    return text.slice(0, 240)
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const error = record.error

    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>
      const nestedMessage = errorRecord.message || errorRecord.code
      if (typeof nestedMessage === 'string') return nestedMessage
    }

    const message = record.message || record.detail || record.code
    if (typeof message === 'string') return message
  }

  return null
}

export function getNangoUserFacingError(status: number, data: unknown): string {
  const summary = summarizeNangoFailure(data)

  if (status >= 500) {
    return summary
      ? `OAuth service is unavailable (${summary}).`
      : 'OAuth service is unavailable. Check the OAuth backend and try again.'
  }

  if (status === 401 || status === 403) {
    return 'OAuth service authentication failed. Check the Nango secret key and OAuth backend configuration.'
  }

  return summary || 'Failed to create OAuth session'
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Fetch from Nango with timeout + retry + structured error handling.
 *
 * Throws on non-retryable failures. Returns `{ ok, status, data }` so
 * callers can inspect status without try/catch for expected failures (404 etc.).
 */
export async function nangoFetch<T = unknown>(
  opts: NangoFetchOptions,
): Promise<NangoFetchResult<T>> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    label = 'nango-fetch',
    skipRetry = false,
  } = opts

  const effectiveRetries = skipRetry ? 1 : maxRetries
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= effectiveRetries; attempt++) {
    try {
      const requestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: buildAbortSignal(timeoutMs),
        dispatcher: SHARED_FETCH_DISPATCHER,
      } as RequestInit & { dispatcher: Agent }

      const response = await fetch(url, requestInit as any)

      // Success or non-retryable failure → return immediately
      if (response.ok || !isRetryable(response.status) || attempt === effectiveRetries) {
        let data: T
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          data = (await response.json()) as T
        } else {
          data = (await response.text()) as unknown as T
        }

        if (!response.ok && attempt === effectiveRetries && isRetryable(response.status)) {
          ErrorService.captureException(
            new Error(`[${label}] Nango ${method} ${url} failed after ${effectiveRetries} attempts: ${response.status}`),
            {
              severity: 'error',
              context: { label, url, method, status: response.status, attempts: attempt },
              tags: { layer: 'oauth', route: label },
            },
          )
        }

        return { ok: response.ok, status: response.status, data, headers: response.headers }
      }

      // Retryable → backoff
      const retryAfter = response.headers.get('Retry-After')
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : DEFAULT_BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)

      ErrorService.addBreadcrumb('nango-fetch', `[${label}] Retrying after ${delayMs}ms (attempt ${attempt}/${effectiveRetries}, status ${response.status})`)
      await new Promise((r) => setTimeout(r, delayMs))
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // AbortError = timeout
      if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') {
        ErrorService.captureException(
          new Error(`[${label}] Nango ${method} ${url} timed out after ${timeoutMs}ms (attempt ${attempt}/${effectiveRetries})`),
          {
            severity: attempt === effectiveRetries ? 'error' : 'warning',
            context: { label, url, method, timeoutMs, attempt },
            tags: { layer: 'oauth', route: label },
          },
        )

        if (attempt < effectiveRetries) {
          const delayMs = DEFAULT_BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)
          await new Promise((r) => setTimeout(r, delayMs))
          continue
        }
      }

      // Non-timeout network error on last attempt
      if (attempt === effectiveRetries) {
        ErrorService.captureException(lastError, {
          severity: 'error',
          context: { label, url, method, attempt },
          tags: { layer: 'oauth', route: label },
        })
        throw lastError
      }

      const delayMs = DEFAULT_BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error(`[${label}] Unexpected retry exhaustion`)
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Fetch from the Lucid OAuth backend.
 *
 * This is not the raw Nango server. These routes are app-scoped endpoints
 * that authenticate with the current user token/session and can apply Lucid's
 * own authorization and normalization rules.
 */
export function nangoBackendFetch<T = unknown>(
  path: string,
  opts: Omit<NangoFetchOptions, 'url'> & { privyToken?: string; userId?: string } = {},
) {
  const { privyToken, userId, headers = {}, ...rest } = opts
  const normalizedPath = path.startsWith('/api/oauth/')
    ? path
    : `/api/oauth${path.startsWith('/') ? path : `/${path}`}`
  const merged: Record<string, string> = { ...headers }
  if (privyToken) merged['Authorization'] = `Bearer ${privyToken}`
  if (userId) merged['X-User-Id'] = userId

  return nangoFetch<T>({
    url: `${OAUTH_API_URL}${normalizedPath}`,
    headers: merged,
    ...rest,
  })
}

/** Fetch from the Nango proxy (direct provider API calls via Nango). */
export function nangoProxyFetch<T = unknown>(
  endpoint: string,
  opts: {
    connectionId: string
    providerConfigKey: string
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    extraHeaders?: Record<string, string>
    label?: string
    timeoutMs?: number
    maxRetries?: number
  },
) {
  if (!NANGO_SECRET_KEY) {
    throw new Error('NANGO_SECRET_KEY is not configured')
  }

  const { connectionId, providerConfigKey, method = 'GET', body, extraHeaders = {}, label, timeoutMs, maxRetries } = opts

  return nangoFetch<T>({
    url: `${NANGO_HOST}/proxy/${endpoint}`,
    method,
    headers: {
      Authorization: `Bearer ${NANGO_SECRET_KEY}`,
      'Connection-Id': connectionId,
      'Provider-Config-Key': providerConfigKey,
      ...extraHeaders,
    },
    body,
    label: label ?? `proxy-${providerConfigKey}`,
    timeoutMs,
    maxRetries,
  })
}

/**
 * Provider-specific OAuth scope overrides.
 *
 * Nango's built-in OAuth templates default to minimal scopes. We override them
 * here so product features (bot channels, search, file uploads, etc.) have the
 * scopes they need. Each key MUST correspond to an integration actually
 * configured on the Nango server — Nango v0.69+ validates every key in
 * `integrations_config_defaults` and rejects the entire session request with
 * `invalid_body` if any key references a non-existent integration.
 *
 * Therefore `createNangoSessionToken` sends ONLY the entry for the requested
 * provider, not the whole map.
 */
const PROVIDER_SCOPE_DEFAULTS: Record<string, { authorization_params: Record<string, string> }> = {
  'twitter-v2': {
    authorization_params: {
      scope: 'tweet.read tweet.write users.read like.read like.write follows.read follows.write bookmark.read bookmark.write offline.access',
    },
  },
  'slack': {
    authorization_params: {
      // Bot scopes (added: users:read.email for find-user-by-email, pins:read for list-pins)
      scope: 'channels:read channels:join channels:manage chat:write chat:write.customize commands groups:read groups:write im:read im:write mpim:read reactions:read reactions:write users:read users:read.email pins:read files:read',
      // User scopes (search:read required for search-messages and search-files — these APIs only work with user tokens)
      user_scope: 'search:read',
    },
  },
  'jira': {
    authorization_params: {
      scope: 'read:jira-work write:jira-work read:jira-user',
    },
  },
  'salesforce': {
    authorization_params: {
      scope: 'api refresh_token full',
    },
  },
  'zoom': {
    authorization_params: {
      scope: 'meeting:write meeting:read user:read',
    },
  },
  'hubspot': {
    authorization_params: {
      scope: 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.owners.read tickets crm.objects.marketing_events.read content forms forms-uploaded-files external_integrations.forms.access sales-email-read',
    },
  },
  'linear': {
    authorization_params: {
      scope: 'read write issues:create',
    },
  },
  'airtable': {
    authorization_params: {
      scope: 'data.records:read data.records:write schema.bases:read webhook:manage',
    },
  },
  'zendesk': {
    authorization_params: {
      scope: 'read write',
    },
  },
  'linkedin': {
    authorization_params: {
      scope: 'r_liteprofile w_member_social',
    },
  },
  'gong': {
    authorization_params: {
      scope: 'api:calls:read:transcript',
    },
  },
  'github': {
    authorization_params: {
      scope: 'repo read:user read:org',
    },
  },
  'discord': {
    authorization_params: {
      scope: 'identify guilds guilds.members.read bot',
    },
  },
  'trello': {
    authorization_params: {
      scope: 'read,write',
    },
  },
  'asana': {
    authorization_params: {
      scope: 'default',
    },
  },
  'reddit': {
    authorization_params: {
      scope: 'identity read submit mysubreddits',
    },
  },
  'paypal': {
    authorization_params: {
      scope: 'openid https://uri.paypal.com/services/reporting/search/read https://uri.paypal.com/services/invoicing',
    },
  },
  'instagram': {
    authorization_params: {
      scope: 'instagram_basic instagram_manage_insights',
    },
  },
  'facebook': {
    authorization_params: {
      scope: 'pages_show_list pages_manage_posts read_insights',
    },
  },
  'tiktok': {
    authorization_params: {
      scope: 'user.info.basic video.list',
    },
  },
  'bitly': {
    authorization_params: {
      scope: '',
    },
  },
  'typeform': {
    authorization_params: {
      scope: 'forms:read responses:read',
    },
  },
  'canva': {
    authorization_params: {
      scope: 'design:content:read design:meta:read design:content:write',
    },
  },
  'lemlist': {
    authorization_params: {
      scope: '',
    },
  },
}

/** Create a Nango session token (server-side, uses NANGO_SECRET_KEY). */
export async function createNangoSessionToken(opts: {
  userId: string
  email?: string
  displayName?: string
  provider?: string
}) {
  if (!NANGO_SECRET_KEY) {
    throw new Error('NANGO_SECRET_KEY is not configured')
  }

  const url = `${NANGO_API_URL}/connect/sessions`

  // Only send the scope override for the requested provider. Sending the full
  // map fails validation on any Nango server that doesn't have every provider
  // configured (see PROVIDER_SCOPE_DEFAULTS docstring).
  const providerDefaults =
    opts.provider && PROVIDER_SCOPE_DEFAULTS[opts.provider]
      ? { [opts.provider]: PROVIDER_SCOPE_DEFAULTS[opts.provider] }
      : undefined

  const request = () =>
    nangoFetch<{ data: { token: string; connect_link: string; expires_at: string } }>({
      url,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NANGO_SECRET_KEY}`,
      },
      body: {
        end_user: {
          id: opts.userId,
          email: opts.email || `${opts.userId}@app.local`,
          display_name: opts.displayName || opts.userId,
        },
        ...(opts.provider ? { allowed_integrations: [opts.provider] } : {}),
        ...(providerDefaults ? { integrations_config_defaults: providerDefaults } : {}),
      },
      label: 'session-create',
      // Session creation is user-interactive, so keep each attempt bounded and
      // avoid long exponential backoff. We do one immediate retry below for
      // transient connect failures without turning the UX into a 30-60s wait.
      skipRetry: true,
      timeoutMs: 12_000,
    })

  try {
    const firstResult = await request()
    if (firstResult.ok || !isRetryable(firstResult.status)) {
      return firstResult
    }

    ErrorService.addBreadcrumb('nango-fetch', `[session-create] first attempt returned ${firstResult.status}, retrying once`, {
      provider: opts.provider,
      userId: opts.userId,
      status: firstResult.status,
    })
    await new Promise((resolve) => setTimeout(resolve, 250))
    return request()
  } catch (error) {
    ErrorService.addBreadcrumb('nango-fetch', `[session-create] first attempt failed, retrying once`, {
      provider: opts.provider,
      userId: opts.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    await new Promise((resolve) => setTimeout(resolve, 250))
    return request()
  }
}
