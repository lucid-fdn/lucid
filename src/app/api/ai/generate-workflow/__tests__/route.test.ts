import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn(),
  getServerAuth: vi.fn(),
  validateAIPrompt: vi.fn(),
  checkAIGenerationRateLimit: vi.fn(),
  getBYOKModel: vi.fn(),
  getLucidModel: vi.fn(),
  isUserOrgMember: vi.fn(),
  evaluateEntitlement: vi.fn(),
  guardEntitlement: vi.fn(),
  incrementUsage: vi.fn(),
  runAIGeneration: vi.fn(),
  writeAIGenerationEvent: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  convertToModelMessages: mocks.convertToModelMessages,
  Output: {
    object: vi.fn((value: unknown) => value),
  },
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getServerAuth: mocks.getServerAuth,
}))

vi.mock('@/lib/ai/validation', () => ({
  validateAIPrompt: mocks.validateAIPrompt,
}))

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAIGenerationRateLimit: mocks.checkAIGenerationRateLimit,
}))

vi.mock('@/lib/ai/byok-provider', () => ({
  getBYOKModel: mocks.getBYOKModel,
}))

vi.mock('@/lib/ai/providers', () => ({
  getLucidModel: mocks.getLucidModel,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: mocks.isUserOrgMember,
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

vi.mock('@/lib/ai/control-plane/events', () => ({
  writeAIGenerationEvent: mocks.writeAIGenerationEvent,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: mocks.captureException,
  },
}))

vi.mock('@/lib/ai/schemas', () => ({
  workflowGenerationSchema: {},
}))

import { POST } from '../route'

describe('POST /api/ai/generate-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getServerAuth.mockResolvedValue({ isAuthenticated: true, userId: 'user-1' })
    mocks.validateAIPrompt.mockReturnValue({ valid: true, sanitized: 'Build a workflow' })
    mocks.checkAIGenerationRateLimit.mockResolvedValue({ allowed: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.evaluateEntitlement.mockResolvedValue({ allowed: true })
    mocks.guardEntitlement.mockReturnValue(null)
    mocks.getBYOKModel.mockResolvedValue({ model: 'resolved-model' })
    mocks.convertToModelMessages.mockResolvedValue([{ role: 'user', content: 'Build a workflow' }])
    mocks.incrementUsage.mockResolvedValue(undefined)
    mocks.writeAIGenerationEvent.mockResolvedValue('event-1')

    const streamResult = {
      toUIMessageStreamResponse: vi.fn(() => new Response('ui-stream', { status: 200 })),
      toTextStreamResponse: vi.fn(() => new Response('text-stream', { status: 200 })),
    }
    mocks.streamText.mockImplementation((options: { onFinish?: (event: { usage: { inputTokens: number; outputTokens: number } }) => Promise<void> }) => {
      options.onFinish?.({ usage: { inputTokens: 7, outputTokens: 11 } })
      return streamResult
    })
    mocks.runAIGeneration.mockImplementation(async (input: { adapter: (adapterInput: unknown) => Promise<unknown>; input: unknown }) => ({
      output: await input.adapter(input.input),
    }))
  })

  it('streams workflow generation through the control plane and records final token usage', async () => {
    const response = await POST(new NextRequest('http://localhost/api/ai/generate-workflow', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Build a workflow' }],
        orgId: 'org-1',
        structured: false,
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ui-stream')
    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'workflow-generation',
      modality: 'text',
      recordSuccessEvent: false,
    }))
    expect(mocks.writeAIGenerationEvent).toHaveBeenCalledWith(expect.objectContaining({
      context: { userId: 'user-1', orgId: 'org-1' },
      feature: 'workflow-generation',
      modality: 'text',
      success: true,
      usage: {
        inputTokens: 7,
        outputTokens: 11,
        totalTokens: 18,
      },
    }))
  })
})
