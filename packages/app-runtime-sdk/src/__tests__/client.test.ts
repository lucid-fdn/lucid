import { describe, expect, it } from 'vitest'
import {
  LucidAppRuntimeApiError,
  createOperatorAppRuntimeClient,
  createPublicAppRuntimeClient,
  type LucidRuntimeFetch,
} from '../index.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('app runtime sdk', () => {
  it('calls public runtime endpoints with the expected slug and bearer token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl: LucidRuntimeFetch = async (url, init) => {
      calls.push({ url: String(url), init })
      return jsonResponse({
        data: {
          config: {
            app_id: 'app',
            slug: 'support',
            name: 'Support',
            description: null,
            status: 'active',
            visibility: 'public',
            capabilities: ['chat'],
            theme: {},
            public_endpoints: {},
            commerce: { paid_actions: {} },
            consent: {},
          },
        },
        meta: { request_id: 'req', app_runtime_api_version: 'v1' },
      })
    }

    const client = createPublicAppRuntimeClient({
      baseUrl: 'https://lucid.test',
      slug: 'support',
      token: 'lucid_public_test',
      fetch: fetchImpl,
      auth: { mode: 'none' },
    })

    await expect(client.getConfig()).resolves.toMatchObject({ config: { slug: 'support' } })
    expect(calls[0].url).toBe('https://lucid.test/api/app-runtime/v1/public/apps/support/config')
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer lucid_public_test')
  })

  it('wraps API errors with runtime metadata', async () => {
    const client = createPublicAppRuntimeClient({
      baseUrl: 'https://lucid.test',
      slug: 'support',
      fetch: async () => jsonResponse({
        error: {
          code: 'origin_not_allowed',
          message: 'Nope.',
          request_id: 'req_123',
        },
      }, 403),
      auth: { mode: 'none' },
    })

    await expect(client.getStatus()).rejects.toMatchObject({
      name: 'LucidAppRuntimeApiError',
      status: 403,
      code: 'origin_not_allowed',
      requestId: 'req_123',
    } satisfies Partial<LucidAppRuntimeApiError>)
  })

  it('calls operator token and origin management endpoints', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    const fetchImpl: LucidRuntimeFetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body as string | undefined })
      return jsonResponse({
        data: { token: { id: 'tok', token: 'secret', token_preview: 'lucid_...', capabilities: [], expires_at: null } },
        meta: { request_id: 'req', app_runtime_api_version: 'v1' },
      })
    }
    const client = createOperatorAppRuntimeClient({
      baseUrl: 'https://lucid.test',
      appId: 'app_123',
      csrfToken: 'csrf',
      fetch: fetchImpl,
      auth: { mode: 'cookie' },
    })

    await client.createToken({ label: 'embed', capabilities: ['chat'] })
    expect(calls[0]).toMatchObject({
      url: 'https://lucid.test/api/app-runtime/v1/operator/apps/app_123/tokens',
      method: 'POST',
    })
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ label: 'embed', capabilities: ['chat'] })
  })
})
