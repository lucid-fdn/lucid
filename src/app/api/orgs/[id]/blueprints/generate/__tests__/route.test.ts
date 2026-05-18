import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireOrgRequestContext: vi.fn(),
  validateAIPrompt: vi.fn(),
  checkAIGenerationRateLimit: vi.fn(),
  evaluateEntitlement: vi.fn(),
  guardEntitlement: vi.fn(),
  incrementUsage: vi.fn(),
  runAIGeneration: vi.fn(),
  generatedBlueprintResultParse: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/request-context/org', () => ({
  requireOrgRequestContext: mocks.requireOrgRequestContext,
}))

vi.mock('@/lib/ai/validation', () => ({
  validateAIPrompt: mocks.validateAIPrompt,
}))

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAIGenerationRateLimit: mocks.checkAIGenerationRateLimit,
}))

vi.mock('@/lib/entitlements', () => ({
  evaluateEntitlement: mocks.evaluateEntitlement,
  guardEntitlement: mocks.guardEntitlement,
}))

vi.mock('@/lib/plans', () => ({
  incrementUsage: mocks.incrementUsage,
}))

vi.mock('@/lib/ai/control-plane/run-generation', () => ({
  runAIGeneration: mocks.runAIGeneration,
}))

vi.mock('@/lib/ai/control-plane/adapters/builder', () => ({
  builderGenerationAdapter: vi.fn(),
}))

vi.mock('@/lib/ai/project-generation/schemas', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/ai/project-generation/schemas')>()
  return {
    ...actual,
    generatedBlueprintResultSchema: {
      parse: mocks.generatedBlueprintResultParse,
    },
  }
})

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: mocks.captureException,
  },
}))

import { POST } from '../route'

describe('POST /api/orgs/[id]/blueprints/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOrgRequestContext.mockResolvedValue({
      ok: true,
      context: { userId: 'user-1' },
    })
    mocks.validateAIPrompt.mockReturnValue({ valid: true, sanitized: 'Build a support agent' })
    mocks.checkAIGenerationRateLimit.mockResolvedValue({ allowed: true })
    mocks.evaluateEntitlement.mockResolvedValue({ allowed: true })
    mocks.guardEntitlement.mockReturnValue(null)
    mocks.incrementUsage.mockResolvedValue(undefined)
    mocks.generatedBlueprintResultParse.mockImplementation((value: unknown) => value)
    mocks.runAIGeneration.mockResolvedValue({
      output: {
        result: {
          mode: 'template',
          blueprint: { name: 'Support Agent' },
        },
        models: {
          modelId: 'lucid-auto',
        },
      },
    })
  })

  it('keeps blueprint response shape while using the builder control-plane adapter', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orgs/11111111-1111-4111-8111-111111111111/blueprints/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Build a support agent',
          preferred_mode: 'template',
          model: 'lucid-auto',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) } as never,
    )

    await expect(response.json()).resolves.toEqual({
      mode: 'template',
      blueprint: { name: 'Support Agent' },
    })
    expect(response.status).toBe(200)
    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'project-generation',
      modality: 'builder',
      model: 'lucid-auto',
      prompt: 'Build a support agent',
      input: expect.objectContaining({
        orgId: '11111111-1111-4111-8111-111111111111',
        prompt: 'Build a support agent',
        preferredMode: 'template',
      }),
    }))
    expect(mocks.incrementUsage).toHaveBeenCalled()
  })
})
