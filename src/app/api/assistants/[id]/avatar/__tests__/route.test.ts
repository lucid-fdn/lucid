import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  getAssistant: vi.fn(),
  isUserOrgMember: vi.fn(),
  checkAIGenerationRateLimit: vi.fn(),
  evaluateEntitlement: vi.fn(),
  guardEntitlement: vi.fn(),
  createAgentAvatarGenerationJob: vi.fn(),
  serializeAgentAvatarJob: vi.fn(),
  buildAvatarSpec: vi.fn(),
  getCurrentAgentAvatarAsset: vi.fn(),
  markAgentAvatarAssetCurrent: vi.fn(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/db', () => ({
  getAssistant: mocks.getAssistant,
  isUserOrgMember: mocks.isUserOrgMember,
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
}))

vi.mock('@/lib/ai/agent-avatar/storage', () => ({
  getCurrentAgentAvatarAsset: mocks.getCurrentAgentAvatarAsset,
  markAgentAvatarAssetCurrent: mocks.markAgentAvatarAssetCurrent,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST as generateAvatar } from '../generate/route'
import { GET as getCurrentAvatar } from '../route'
import { POST as acceptAvatar } from '../accept/route'

const assistant = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Mira',
  description: 'Research assistant',
}

const asset = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  url: 'https://cdn.example/avatar.webp',
  provider: 'openai',
  model: 'gpt-image-2',
  width: 1024,
  height: 1024,
  mimeType: 'image/webp',
  metadata: { usage: { totalTokens: 10 } },
  promptVersion: 'agent-avatar-v1',
  stylePreset: 'lucid-studio',
  angle: 'front-three-quarter',
  crop: 'head-and-shoulders',
  expression: 'warm',
  background: 'studio',
  lighting: 'soft',
}

const job = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  status: 'queued',
  assetId: null,
}

const ctx = { params: Promise.resolve({ id: assistant.id }) }

describe('/api/assistants/[id]/avatar routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue('user-1')
    mocks.getAssistant.mockResolvedValue(assistant)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.checkAIGenerationRateLimit.mockResolvedValue({ allowed: true })
    mocks.evaluateEntitlement.mockResolvedValue({ allowed: true })
    mocks.guardEntitlement.mockReturnValue(null)
    mocks.buildAvatarSpec.mockReturnValue({ assistantId: assistant.id, orgId: assistant.org_id, userId: 'user-1' })
    mocks.createAgentAvatarGenerationJob.mockResolvedValue(job)
    mocks.serializeAgentAvatarJob.mockReturnValue(job)
    mocks.getCurrentAgentAvatarAsset.mockResolvedValue(asset)
    mocks.markAgentAvatarAssetCurrent.mockResolvedValue(asset)
  })

  it('generates an avatar for an existing assistant', async () => {
    const response = await generateAvatar(new NextRequest(`http://localhost/api/assistants/${assistant.id}/avatar/generate`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mira',
        stylePreset: 'lucid-studio',
      }),
    }), ctx)

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ data: { id: job.id, status: 'queued' } })
    expect(mocks.buildAvatarSpec).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      orgId: assistant.org_id,
      assistantId: assistant.id,
    }))
    expect(mocks.createAgentAvatarGenerationJob).toHaveBeenCalledWith({ assistantId: assistant.id, orgId: assistant.org_id, userId: 'user-1' })
  })

  it('loads the current avatar for an existing assistant', async () => {
    const response = await getCurrentAvatar(
      new NextRequest(`http://localhost/api/assistants/${assistant.id}/avatar`),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: asset })
    expect(mocks.getCurrentAgentAvatarAsset).toHaveBeenCalledWith(assistant.id)
  })

  it('accepts a generated avatar as current', async () => {
    const response = await acceptAvatar(new NextRequest(`http://localhost/api/assistants/${assistant.id}/avatar/accept`, {
      method: 'POST',
      body: JSON.stringify({ assetId: asset.id }),
    }), ctx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: asset })
    expect(mocks.markAgentAvatarAssetCurrent).toHaveBeenCalledWith({
      assetId: asset.id,
      assistantId: assistant.id,
      orgId: assistant.org_id,
    })
  })
})
