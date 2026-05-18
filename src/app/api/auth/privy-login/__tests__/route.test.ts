import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mockCookies = vi.fn()
const mockVerifyAuthToken = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockUpdateEq = vi.fn()
const mockUpdate = vi.fn()
const mockFrom = vi.fn()
const mockSetCSRFToken = vi.fn()
const mockGetCSRFToken = vi.fn()

vi.mock('next/headers', () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
}))

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: class MockPrivyClient {
    verifyAuthToken = mockVerifyAuthToken
    getUser = vi.fn()
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

vi.mock('@/lib/auth/csrf', () => ({
  getCSRFToken: (...args: unknown[]) => mockGetCSRFToken(...args),
  setCSRFToken: (...args: unknown[]) => mockSetCSRFToken(...args),
}))

vi.mock('@/lib/auth/handle', () => ({
  generateUniqueHandle: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

import { POST } from '../route'

describe('privy login route', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'privy-app-id'
    process.env.PRIVY_APP_SECRET = 'privy-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    process.env.NODE_ENV = 'production'

    mockVerifyAuthToken.mockReset()
    mockSingle.mockReset()
    mockEq.mockReset()
    mockSelect.mockReset()
    mockUpdateEq.mockReset()
    mockUpdate.mockReset()
    mockFrom.mockReset()
    mockSetCSRFToken.mockReset()
    mockGetCSRFToken.mockReset()
    mockCookies.mockReset()

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    })

    mockGetCSRFToken.mockResolvedValue('csrf-token')
    const identityChain = {
      eq: mockEq,
      single: mockSingle,
    }
    mockSelect.mockReturnValue(identityChain)
    mockEq.mockReturnValue(identityChain)
    mockUpdate.mockReturnValue({ eq: mockUpdateEq })
    mockUpdateEq.mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'identity_links') {
        return { select: mockSelect }
      }
      if (table === 'profiles') {
        return { update: mockUpdate }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('sets a shared lucid-auth-token cookie for production Privy logins', async () => {
    mockVerifyAuthToken.mockResolvedValue({ userId: 'did:privy:user-1' })
    mockSingle.mockResolvedValue({
      data: { user_id: 'internal-user-1' },
      error: null,
    })

    const request = new NextRequest('https://www.lucid.foundation/api/auth/privy-login', {
      method: 'POST',
      headers: {
        authorization: 'Bearer privy.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ walletAddress: null }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie') || ''
    expect(setCookie).toContain('lucid-auth-token=privy.jwt.token')
    expect(setCookie).toContain('Domain=.lucid.foundation')
    expect(setCookie).toContain('Secure')
  })

  it('uses a host-only cookie on Railway preview/prod hosts', async () => {
    mockVerifyAuthToken.mockResolvedValue({ userId: 'did:privy:user-1' })
    mockSingle.mockResolvedValue({
      data: { user_id: 'internal-user-1' },
      error: null,
    })

    const request = new NextRequest('https://lucid-production-e9b8.up.railway.app/api/auth/privy-login', {
      method: 'POST',
      headers: {
        authorization: 'Bearer privy.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ walletAddress: null }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie') || ''
    expect(setCookie).toContain('lucid-auth-token=privy.jwt.token')
    expect(setCookie).not.toContain('Domain=')
    expect(setCookie).toContain('Secure')
  })
})
