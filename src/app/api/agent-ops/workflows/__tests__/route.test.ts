import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET } from '../route'
import { getUserId } from '@/lib/auth/server-utils'

const mockGetUserId = vi.mocked(getUserId)

describe('GET /api/agent-ops/workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserId.mockResolvedValue('user-1')
    mocks.checkRateLimit.mockResolvedValue({ success: true })
  })

  function request() {
    return new NextRequest('http://localhost:3000/api/agent-ops/workflows')
  }

  it('requires authentication', async () => {
    mockGetUserId.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('rate limits workflow registry reads', async () => {
    mocks.checkRateLimit.mockResolvedValue({ success: false })

    const response = await GET(request())

    expect(response.status).toBe(429)
  })

  it('returns public workflow metadata for authenticated users', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'review',
          executionMode: 'dag',
          outputSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
          teamOps: expect.objectContaining({
            dispatchTier: 'heavy',
            compatibleRuntimeProfiles: expect.arrayContaining(['shared', 'c1_managed']),
          }),
        }),
        expect.objectContaining({
          id: 'qa',
          evidenceTypes: expect.arrayContaining(['screenshot', 'console_log']),
          teamOps: expect.objectContaining({
            specialists: expect.arrayContaining([
              expect.objectContaining({ slug: 'browser-qa' }),
            ]),
          }),
        }),
      ]),
    )
  })
})
