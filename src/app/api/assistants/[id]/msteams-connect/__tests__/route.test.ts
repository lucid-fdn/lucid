import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

vi.mock('@/lib/features', () => ({
  FEATURES: {
    teamsHosted: true,
  },
}))

import { POST } from '../route'

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation'

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
})

describe('assistant teams connect route', () => {
  it('returns the canonical hosted install URL instead of localhost origin', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)

    const request = new NextRequest('http://localhost:3000/api/assistants/assistant-1/msteams-connect', {
      method: 'POST',
    })
    const response = await POST(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      connectUrl: 'https://www.lucid.foundation/api/webhooks/msteams/oauth/install?assistant_id=assistant-1',
    })
  })
})
