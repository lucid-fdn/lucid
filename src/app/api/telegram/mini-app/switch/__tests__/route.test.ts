import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSetPrimaryTelegramChannel = vi.fn()
const mockSwitchTelegramChatWorkspace = vi.fn()
const mockVerifyTelegramMiniAppInitData = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  setPrimaryTelegramChannel: (...args: unknown[]) => mockSetPrimaryTelegramChannel(...args),
  switchTelegramChatWorkspace: (...args: unknown[]) => mockSwitchTelegramChatWorkspace(...args),
}))
vi.mock('@/lib/telegram/mini-app', () => ({
  verifyTelegramMiniAppInitData: (...args: unknown[]) => mockVerifyTelegramMiniAppInitData(...args),
}))

import { POST } from '../route'

const ASSISTANT_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WORKSPACE_ASSISTANT_ID = '99999999-9999-4999-8999-999999999999'

describe('POST /api/telegram/mini-app/switch', () => {
  beforeEach(() => {
    process.env.TELEGRAM_HOSTED_BOT_TOKEN = 'bot-token'
    mockSetPrimaryTelegramChannel.mockReset()
    mockSwitchTelegramChatWorkspace.mockReset()
    mockVerifyTelegramMiniAppInitData.mockReset()
  })

  it('switches the active agent for a valid private-chat session', async () => {
    mockVerifyTelegramMiniAppInitData.mockReturnValue({
      chatId: 'chat-1',
      chatType: 'private',
      userId: 'user-1',
      queryId: null,
    })
    mockSetPrimaryTelegramChannel.mockResolvedValue({ ok: true })

    const request = new NextRequest('http://localhost/api/telegram/mini-app/switch', {
      method: 'POST',
      body: JSON.stringify({
        initData: 'signed-init-data',
        target: 'agent',
        assistantId: ASSISTANT_ID,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mockSetPrimaryTelegramChannel).toHaveBeenCalledWith(
      'chat-1',
      ASSISTANT_ID,
    )
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('switches the active workspace for a valid private-chat session', async () => {
    mockVerifyTelegramMiniAppInitData.mockReturnValue({
      chatId: 'chat-1',
      chatType: 'private',
      userId: 'user-1',
      queryId: null,
    })
    mockSwitchTelegramChatWorkspace.mockResolvedValue({
      ok: true,
      assistantId: WORKSPACE_ASSISTANT_ID,
    })

    const request = new NextRequest('http://localhost/api/telegram/mini-app/switch', {
      method: 'POST',
      body: JSON.stringify({
        initData: 'signed-init-data',
        target: 'workspace',
        orgId: ORG_ID,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mockSwitchTelegramChatWorkspace).toHaveBeenCalledWith('chat-1', ORG_ID)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assistantId: WORKSPACE_ASSISTANT_ID,
    })
  })

  it('rejects non-private chats', async () => {
    mockVerifyTelegramMiniAppInitData.mockReturnValue({
      chatId: 'chat-1',
      chatType: 'group',
      userId: 'user-1',
      queryId: null,
    })

    const request = new NextRequest('http://localhost/api/telegram/mini-app/switch', {
      method: 'POST',
      body: JSON.stringify({
        initData: 'signed-init-data',
        target: 'agent',
        assistantId: ASSISTANT_ID,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Switching is only available in private chats.',
    })
  })
})
