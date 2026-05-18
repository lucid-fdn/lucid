import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  getAssistant: vi.fn(),
  isUserOrgMember: vi.fn(),
  getMediaProviderConfig: vi.fn(),
  runAIGeneration: vi.fn(),
  captureException: vi.fn(),
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

vi.mock('@/lib/ai/media-provider-config', () => ({
  getMediaProviderConfig: mocks.getMediaProviderConfig,
}))

vi.mock('@/lib/ai/control-plane/run-generation', () => ({
  runAIGeneration: mocks.runAIGeneration,
}))

vi.mock('@/lib/ai/control-plane/adapters/speech', () => ({
  speechGenerationAdapter: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: mocks.captureException,
  },
}))

import { POST } from '../route'

describe('POST /api/assistants/[id]/telegram-voice-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue('user-1')
    mocks.getAssistant.mockResolvedValue({
      id: 'assistant-1',
      org_id: 'org-1',
      name: 'Mira',
      telegram_display_name: 'Mira',
      telegram_voice_id: 'coral',
      telegram_voice_instructions: 'Warm and concise.',
    })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.getMediaProviderConfig.mockReturnValue({
      gatewayBaseUrls: ['https://trustgate.example'],
      gatewayApiKeys: ['key'],
    })
    mocks.runAIGeneration.mockResolvedValue({
      output: {
        buffer: Buffer.from('voice-bytes'),
        mimeType: 'audio/ogg',
        fileName: 'telegram-voice-preview.ogg',
        provider: 'trustgate',
        model: 'gpt-4o-mini-tts',
      },
    })
  })

  it('returns the same audio response while recording a voice-preview generation', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/telegram-voice-preview', {
        method: 'POST',
        body: JSON.stringify({
          preview_text: 'Hello from Mira.',
          voice_id: 'coral',
          voice_instructions: 'Warm and concise.',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/ogg')
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="telegram-voice-preview.ogg"')
    await expect(response.text()).resolves.toBe('voice-bytes')

    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      context: {
        userId: 'user-1',
        orgId: 'org-1',
        assistantId: 'assistant-1',
      },
      feature: 'voice-preview',
      modality: 'speech',
      prompt: 'Hello from Mira.',
      input: expect.objectContaining({
        text: 'Hello from Mira.',
        gatewayBaseUrls: ['https://trustgate.example'],
        gatewayApiKeys: ['key'],
        voice: 'coral',
        instructions: 'Warm and concise.',
        format: 'opus',
      }),
    }))
  })

  it('keeps assistant org membership enforcement before generation', async () => {
    mocks.isUserOrgMember.mockResolvedValueOnce(false)

    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/telegram-voice-preview', {
        method: 'POST',
        body: JSON.stringify({ preview_text: 'Hello.' }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(403)
    expect(mocks.runAIGeneration).not.toHaveBeenCalled()
  })
})
