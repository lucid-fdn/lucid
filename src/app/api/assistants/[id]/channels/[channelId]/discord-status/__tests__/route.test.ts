import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockListAssistantChannels = vi.fn()
const mockDiscordWorkerFetch = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
  listAssistantChannels: (...args: unknown[]) => mockListAssistantChannels(...args),
}))

vi.mock('@/lib/discord/worker-admin', () => ({
  discordWorkerFetch: (...args: unknown[]) => mockDiscordWorkerFetch(...args),
}))

import { GET, POST } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockListAssistantChannels.mockReset()
  mockDiscordWorkerFetch.mockReset()

  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
  mockIsUserOrgMember.mockResolvedValue(true)
  mockListAssistantChannels.mockResolvedValue([
    {
      id: 'channel-1',
      channel_type: 'discord',
    },
  ])
})

describe('assistant discord status route', () => {
  it('returns the worker status payload on GET', async () => {
    mockDiscordWorkerFetch.mockResolvedValue({ configured: true, running: true })

    const response = await GET(new Request('https://lucid.foundation'), {
      params: Promise.resolve({ id: 'assistant-1', channelId: 'channel-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ configured: true, running: true })
    expect(mockDiscordWorkerFetch).toHaveBeenCalledWith('/discord/status')
  })

  it('runs a live probe on POST', async () => {
    mockDiscordWorkerFetch.mockResolvedValue({ probe: { ok: true } })

    const response = await POST(new Request('https://lucid.foundation', { method: 'POST' }), {
      params: Promise.resolve({ id: 'assistant-1', channelId: 'channel-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ probe: { ok: true } })
    expect(mockDiscordWorkerFetch).toHaveBeenCalledWith('/discord/probe', { method: 'POST' })
  })

  it('rejects non-discord channels', async () => {
    mockListAssistantChannels.mockResolvedValue([{ id: 'channel-1', channel_type: 'slack' }])

    const response = await GET(new Request('https://lucid.foundation'), {
      params: Promise.resolve({ id: 'assistant-1', channelId: 'channel-1' }),
    })

    expect(response.status).toBe(404)
  })
})
