import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  checkAIGenerationRateLimit: vi.fn(),
  runAIGeneration: vi.fn(),
  uploadBuffer: vi.fn(),
  generateAgentAvatar: vi.fn(),
  resolveAvatarOrgContext: vi.fn(),
  buildAvatarSpec: vi.fn(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAIGenerationRateLimit: mocks.checkAIGenerationRateLimit,
}))

vi.mock('@/lib/ai/control-plane/run-generation', () => ({
  runAIGeneration: mocks.runAIGeneration,
}))

vi.mock('@/lib/uploads/storage', () => ({
  uploadBuffer: mocks.uploadBuffer,
}))

vi.mock('@/lib/ai/agent-avatar/generate', () => ({
  generateAgentAvatar: mocks.generateAgentAvatar,
}))

vi.mock('@/lib/ai/agent-avatar/request', () => ({
  avatarGenerateRequestSchema: { parse: (value: unknown) => value },
  buildAvatarSpec: mocks.buildAvatarSpec,
  resolveAvatarOrgContext: mocks.resolveAvatarOrgContext,
}))

import { POST } from '../route'

describe('POST /api/ai/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveAvatarOrgContext.mockResolvedValue({ ok: true, userId: 'user-1', orgId: 'org-1' })
    mocks.checkAIGenerationRateLimit.mockResolvedValue({ allowed: true })
    mocks.runAIGeneration.mockResolvedValue({
      output: {
        provider: 'trustgate',
        model: 'gpt-image-2',
        imageBytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
        usage: { totalTokens: 12 },
        receipt: { latencyMs: 25 },
      },
      generationEventId: 'event-1',
    })
    mocks.uploadBuffer.mockResolvedValue('https://cdn.example/generated.webp')
    mocks.buildAvatarSpec.mockReturnValue({ name: 'Lucid Agent', orgId: 'org-1', userId: 'user-1' })
    mocks.generateAgentAvatar.mockResolvedValue({
      id: 'avatar-1',
      url: 'https://cdn.example/avatar.webp',
      provider: 'trustgate',
      model: 'gpt-image-2',
      width: 1024,
      height: 1024,
      mimeType: 'image/webp',
      metadata: {},
    })
  })

  it('generates and stores a generic image asset through the control plane', async () => {
    const response = await POST(new NextRequest('http://localhost/api/ai/image', {
      method: 'POST',
      body: JSON.stringify({
        purpose: 'generic-image',
        prompt: 'A clean abstract workspace image',
        outputFormat: 'webp',
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data).toMatchObject({
      status: 'succeeded',
      url: 'https://cdn.example/generated.webp',
      provider: 'trustgate',
      model: 'gpt-image-2',
    })
    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'generic-image-generation',
      modality: 'image',
      prompt: 'A clean abstract workspace image',
    }))
    expect(mocks.uploadBuffer).toHaveBeenCalled()
  })

  it('delegates agent-avatar purpose to the avatar service', async () => {
    const response = await POST(new NextRequest('http://localhost/api/ai/image', {
      method: 'POST',
      body: JSON.stringify({
        purpose: 'agent-avatar',
        prompt: 'Friendly agent portrait',
        name: 'Mira',
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data).toMatchObject({
      id: 'avatar-1',
      url: 'https://cdn.example/avatar.webp',
    })
    expect(mocks.generateAgentAvatar).toHaveBeenCalledWith({ name: 'Lucid Agent', orgId: 'org-1', userId: 'user-1' })
    expect(mocks.runAIGeneration).not.toHaveBeenCalled()
  })
})
