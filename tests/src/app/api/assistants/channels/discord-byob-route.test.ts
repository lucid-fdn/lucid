/**
 * POST /api/assistants/[id]/channels — Discord BYOB end-to-end.
 *
 * What this test actually exercises (with all side-effects mocked):
 *   1. Zod `superRefine` rejects Discord BYOB without botToken OR channelId
 *      (short-circuit: Discord validator never called).
 *   2. The route calls `validateDiscordBotToken` against Discord's REST API
 *      before touching the DB, and returns HTTP 400 on 401/403/network.
 *   3. On success, the route calls `createAssistantChannel` with the expanded
 *      shape — `externalChannelId`, `connectionMode='byob'`, and
 *      `secrets.bot_token` — so v1d schema separation actually lands in the
 *      DB instead of being silently dropped.
 *
 * Why mock everything: this is a unit test for the route handler, not an
 * integration test. Real Discord + real Supabase smoke tests live in the
 * staging harness (§v1e).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockGetUserId = vi.fn().mockResolvedValue('user-1')
vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: () => mockGetUserId(),
}))

const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn().mockResolvedValue(true)
const mockCreateAssistantChannel = vi.fn()
const mockListAssistantChannels = vi.fn().mockResolvedValue([])
const mockDeleteAssistantChannel = vi.fn()
vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
  createAssistantChannel: (...args: unknown[]) => mockCreateAssistantChannel(...args),
  listAssistantChannels: (...args: unknown[]) => mockListAssistantChannels(...args),
  deleteAssistantChannel: (...args: unknown[]) => mockDeleteAssistantChannel(...args),
}))

const mockValidateDiscordBotToken = vi.fn()
vi.mock('@/lib/channels/validate-discord-token', () => ({
  validateDiscordBotToken: (...args: unknown[]) => mockValidateDiscordBotToken(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '@/app/api/assistants/[id]/channels/route'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/assistants/asst_1/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'asst_1' })

describe('POST /api/assistants/[id]/channels — Discord BYOB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAssistant.mockResolvedValue({ id: 'asst_1', org_id: 'org_1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockCreateAssistantChannel.mockResolvedValue({
      channel: {
        id: 'chan_1',
        channel_type: 'discord',
        connection_mode: 'byob',
        external_channel_id: '111222333',
        is_active: true,
      },
    })
  })

  it('rejects when bot_token missing (zod), never calls validator', async () => {
    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        channelId: '111222333',
      }),
      { params },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(mockValidateDiscordBotToken).not.toHaveBeenCalled()
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })

  it('rejects when channelId missing (zod), never calls validator', async () => {
    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        botToken: 'whatever',
      }),
      { params },
    )
    expect(res.status).toBe(400)
    expect(mockValidateDiscordBotToken).not.toHaveBeenCalled()
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })

  it('rejects with 400 when Discord returns 401 for the bot token', async () => {
    mockValidateDiscordBotToken.mockResolvedValue({
      ok: false,
      reason: 'invalid',
      status: 401,
    })
    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        botToken: 'revoked-token',
        channelId: '111222333',
      }),
      { params },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Discord bot token validation failed')
    expect(body.reason).toBe('invalid')
    expect(mockValidateDiscordBotToken).toHaveBeenCalledWith('revoked-token')
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })

  it('rejects with 400 on network error (transient, safer to block than persist unverified)', async () => {
    mockValidateDiscordBotToken.mockResolvedValue({ ok: false, reason: 'network' })
    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        botToken: 'good-token',
        channelId: '111222333',
      }),
      { params },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.reason).toBe('network')
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })

  it('persists channel with connection_mode=byob + external_channel_id + secrets.bot_token on success', async () => {
    mockValidateDiscordBotToken.mockResolvedValue({
      ok: true,
      bot: { id: 'bot_user_id', username: 'LucidBot' },
    })

    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        botToken: 'valid-token',
        channelId: '111222333',
      }),
      { params },
    )

    expect(res.status).toBe(201)
    expect(mockValidateDiscordBotToken).toHaveBeenCalledWith('valid-token')
    expect(mockCreateAssistantChannel).toHaveBeenCalledTimes(1)

    const call = mockCreateAssistantChannel.mock.calls[0][0] as Record<string, unknown>
    expect(call.assistantId).toBe('asst_1')
    expect(call.channelType).toBe('discord')
    expect(call.connectionMode).toBe('byob')
    expect(call.externalChannelId).toBe('111222333')
    expect(call.secrets).toEqual({ bot_token: 'valid-token' })

    // Discord uses the gateway (WebSocket), not a webhook — no webhookUrl surfaced.
    const body = await res.json()
    expect(body.webhookUrl).toBeUndefined()
    expect(body.channel).toBeDefined()
  })

  it('returns 403 when user is not an org member (even before any Discord call)', async () => {
    mockIsUserOrgMember.mockResolvedValue(false)

    const res = await POST(
      makeRequest({
        channelType: 'discord',
        connectionMode: 'byob',
        botToken: 'token',
        channelId: '111222333',
      }),
      { params },
    )

    expect(res.status).toBe(403)
    expect(mockValidateDiscordBotToken).not.toHaveBeenCalled()
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })
})
