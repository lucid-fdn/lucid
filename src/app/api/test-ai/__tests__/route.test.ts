import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

describe('/api/test-ai', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('404s in production unless explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_AI_ROUTE', '')
    const { GET } = await import('../route')

    const response = await GET(makeRequest())

    expect(response.status).toBe(404)
  })

  it('requires a bearer secret when explicitly enabled in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_AI_ROUTE', 'true')
    vi.stubEnv('TEST_AI_ROUTE_SECRET', 'diag-secret')
    const { GET } = await import('../route')

    const unauthorized = await GET(makeRequest())
    expect(unauthorized.status).toBe(401)

    const response = await GET(makeRequest('diag-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })
})

function makeRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/test-ai', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
}
