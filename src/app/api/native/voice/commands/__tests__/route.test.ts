import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockCreateNativeVoiceCommand = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/native/control-plane', () => ({
  createNativeVoiceCommand: (...args: unknown[]) => mockCreateNativeVoiceCommand(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

describe('/api/native/voice/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000001')
  })

  it('routes hold-to-talk commands through the native control plane', async () => {
    mockCreateNativeVoiceCommand.mockReturnValue({
      commandId: 'command-1',
      interpretedCommand: 'Pause checkout',
      responseText: 'Confirm first.',
      requiresConfirmation: true,
    })
    const request = new NextRequest('https://app.lucid.example/api/native/voice/commands', {
      method: 'POST',
      body: JSON.stringify({ transcript: 'Pause checkout' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ requiresConfirmation: true })
    expect(mockCreateNativeVoiceCommand).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
      transcript: 'Pause checkout',
      mode: 'hold-to-talk',
    })
  })
})

