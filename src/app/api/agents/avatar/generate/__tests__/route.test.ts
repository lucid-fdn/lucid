import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  checkAIGenerationRateLimit: vi.fn(),
  evaluateEntitlement: vi.fn(),
  guardEntitlement: vi.fn(),
  createAgentAvatarGenerationJob: vi.fn(),
  serializeAgentAvatarJob: vi.fn(),
  resolveAvatarOrgContext: vi.fn(),
  buildAvatarSpec: vi.fn(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAIGenerationRateLimit: mocks.checkAIGenerationRateLimit,
}))

vi.mock('@/lib/entitlements', () => ({
  evaluateEntitlement: mocks.evaluateEntitlement,
  guardEntitlement: mocks.guardEntitlement,
}))

vi.mock('@/lib/ai/agent-avatar/jobs', () => ({
  createAgentAvatarGenerationJob: mocks.createAgentAvatarGenerationJob,
  serializeAgentAvatarJob: mocks.serializeAgentAvatarJob,
}))

vi.mock('@/lib/ai/agent-avatar/request', () => ({
  avatarGenerateRequestSchema: { parse: (value: unknown) => value },
  buildAvatarSpec: mocks.buildAvatarSpec,
  resolveAvatarOrgContext: mocks.resolveAvatarOrgContext,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const job = {
  id: '33333333-3333-4333-8333-333333333333',
  status: 'queued',
  assetId: null,
}

describe('POST /api/agents/avatar/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveAvatarOrgContext.mockResolvedValue({ ok: true, userId: 'user-1', orgId: 'org-1' })
    mocks.checkAIGenerationRateLimit.mockResolvedValue({ allowed: true })
    mocks.evaluateEntitlement.mockResolvedValue({ allowed: true })
    mocks.guardEntitlement.mockReturnValue(null)
    mocks.buildAvatarSpec.mockReturnValue({ name: 'Mira', orgId: 'org-1', userId: 'user-1' })
    mocks.createAgentAvatarGenerationJob.mockResolvedValue(job)
    mocks.serializeAgentAvatarJob.mockReturnValue(job)
  })

  it('generates a draft agent avatar through the avatar service', async () => {
    const response = await POST(new NextRequest('http://localhost/api/agents/avatar/generate', {
      method: 'POST',
      body: JSON.stringify({
        orgId: '22222222-2222-4222-8222-222222222222',
        draftId: 'draft-1',
        name: 'Mira',
        description: 'A research assistant',
        stylePreset: 'lucid-studio',
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(payload.data).toMatchObject({
      id: job.id,
      status: 'queued',
    })
    expect(mocks.createAgentAvatarGenerationJob).toHaveBeenCalledWith({ name: 'Mira', orgId: 'org-1', userId: 'user-1' })
  })
})
