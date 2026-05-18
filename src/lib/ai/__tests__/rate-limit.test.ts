import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const profileSingleMock = vi.fn()
const canonicalCountMock = vi.fn()
const legacyCountMock = vi.fn()
const canonicalInsertMock = vi.fn()
const legacyInsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: (...args: unknown[]) => profileSingleMock(...args),
            }),
          }),
        }
      }

      if (table === 'ai_generation_events') {
        return {
          select: () => ({
            eq: () => ({
              gte: (...args: unknown[]) => canonicalCountMock(...args),
            }),
          }),
          insert: (...args: unknown[]) => canonicalInsertMock(...args),
        }
      }

      if (table === 'ai_workflow_generations') {
        return {
          select: () => ({
            eq: () => ({
              gte: (...args: unknown[]) => legacyCountMock(...args),
            }),
          }),
          insert: (...args: unknown[]) => legacyInsertMock(...args),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

describe('ai generation rate limit helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('E2E_DISABLE_AI_GENERATION_RATE_LIMITS', 'false')
    profileSingleMock.mockResolvedValue({
      data: { subscription_tier: 'starter' },
      error: null,
    })
    canonicalCountMock.mockResolvedValue({ count: 3, error: null })
    legacyCountMock.mockResolvedValue({ count: 0, error: null })
    canonicalInsertMock.mockResolvedValue({ error: null })
    legacyInsertMock.mockResolvedValue({ error: null })
  })

  it('skips rate limiting outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const rateLimit = await import('../rate-limit')
    const result = await rateLimit.checkAIGenerationRateLimit('user-1')

    expect(result.allowed).toBe(true)
    expect(result.tier).toBe('development')
    expect(canonicalCountMock).not.toHaveBeenCalled()
    expect(legacyCountMock).not.toHaveBeenCalled()
  })

  it('allows explicit E2E bypass in Vercel preview smoke runs', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('E2E_DISABLE_AI_GENERATION_RATE_LIMITS', 'true')

    const rateLimit = await import('../rate-limit')
    const result = await rateLimit.checkAIGenerationRateLimit('user-1')

    expect(result.allowed).toBe(true)
    expect(result.tier).toBe('preview-e2e')
    expect(canonicalCountMock).not.toHaveBeenCalled()
    expect(legacyCountMock).not.toHaveBeenCalled()
  })

  it('uses the canonical ai_generation_events table when available', async () => {
    const rateLimit = await import('../rate-limit')

    const result = await rateLimit.checkAIGenerationRateLimit('user-1')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(7)
    expect(canonicalCountMock).toHaveBeenCalled()
    expect(legacyCountMock).not.toHaveBeenCalled()
  })

  it('falls back to the legacy workflow table when the canonical table is unavailable', async () => {
    canonicalCountMock.mockResolvedValue({
      count: null,
      error: { code: '42P01', message: 'relation "ai_generation_events" does not exist' },
    })
    legacyCountMock.mockResolvedValue({ count: 2, error: null })

    const rateLimit = await import('../rate-limit')
    const result = await rateLimit.checkAIGenerationRateLimit('user-1')

    expect(result.remaining).toBe(8)
    expect(legacyCountMock).toHaveBeenCalled()
  })

  it('records generation events in the canonical table', async () => {
    const rateLimit = await import('../rate-limit')

    await rateLimit.recordAIGenerationEvent({
      userId: 'user-1',
      prompt: 'build a support operator',
      success: true,
      feature: 'project-generation',
    })

    expect(canonicalInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        feature: 'project-generation',
        prompt: 'build a support operator',
      }),
    )
    expect(legacyInsertMock).not.toHaveBeenCalled()
  })
})
