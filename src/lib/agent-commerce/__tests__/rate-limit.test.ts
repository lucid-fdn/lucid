import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCommerceError } from '../errors'
import {
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimit,
  enforceAgentCommerceRateLimits,
} from '../rate-limit'
import { claimAgentCommerceRateLimit } from '@/lib/db/agent-commerce'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/agent-commerce', () => ({
  claimAgentCommerceRateLimit: vi.fn(),
}))

const mockedClaim = vi.mocked(claimAgentCommerceRateLimit)

describe('Agent Commerce rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sanitizes shared scope keys', () => {
    expect(agentCommerceRateLimitScope('Org', '0000', 'User With Space')).toBe('org:0000:user_with_space')
  })

  it('allows requests inside the postgres-backed bucket', async () => {
    mockedClaim.mockResolvedValue({
      allowed: true,
      currentValue: 1,
      limitValue: 2,
      resetAt: '2026-05-01T00:01:00.000Z',
    })

    await expect(enforceAgentCommerceRateLimit({
      scope: 'org:test',
      bucket: 'agent-commerce:test',
      windowSeconds: 60,
      limit: 2,
    })).resolves.toBeUndefined()
  })

  it('throws retryable rate-limited errors with reset details', async () => {
    mockedClaim.mockResolvedValue({
      allowed: false,
      currentValue: 3,
      limitValue: 2,
      resetAt: '2026-05-01T00:01:00.000Z',
    })

    await expect(enforceAgentCommerceRateLimit({
      scope: 'org:test',
      bucket: 'agent-commerce:test',
      windowSeconds: 60,
      limit: 2,
    })).rejects.toMatchObject<Partial<AgentCommerceError>>({
      code: 'rate_limited',
      status: 429,
      retryable: true,
    })
  })

  it('checks multiple velocity buckets in order', async () => {
    mockedClaim.mockResolvedValue({
      allowed: true,
      currentValue: 1,
      limitValue: 2,
      resetAt: '2026-05-01T00:01:00.000Z',
    })

    await enforceAgentCommerceRateLimits([
      { scope: 'org:test:user:test', bucket: 'spend', windowSeconds: 60, limit: 2 },
      { scope: 'org:test:merchant:test', bucket: 'merchant', windowSeconds: 60, limit: 2 },
    ])

    expect(mockedClaim).toHaveBeenCalledTimes(2)
  })
})
