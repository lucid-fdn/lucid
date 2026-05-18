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
    slackHosted: true,
  },
}))

import { POST } from '../route'

beforeEach(() => {
  delete process.env.SLACK_HOSTED_REDIRECT_BASE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.APP_URL

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
})

describe('assistant slack connect route', () => {
  it('returns 503 on localhost when no HTTPS redirect base is configured', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)

    const request = new NextRequest('http://localhost:3000/api/assistants/assistant-1/slack-connect', {
      method: 'POST',
    })
    const response = await POST(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Slack hosted connect requires a public HTTPS callback URL',
      details:
        'Slack OAuth does not allow http://localhost callbacks. Use the deployed Lucid site or set SLACK_HOSTED_REDIRECT_BASE_URL to an HTTPS tunnel URL before testing Slack connect locally.',
    })
  })
})
