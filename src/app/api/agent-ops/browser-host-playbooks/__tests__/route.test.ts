import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  listAgentOpsBrowserHostPlaybooks: vi.fn(),
  createAgentOpsBrowserHostPlaybook: vi.fn(),
  getAgentOpsBrowserHostPlaybook: vi.fn(),
  updateAgentOpsBrowserHostPlaybookTrustState: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/db', () => ({
  createAgentOpsBrowserHostPlaybook: mocks.createAgentOpsBrowserHostPlaybook,
  getAgentOpsBrowserHostPlaybook: mocks.getAgentOpsBrowserHostPlaybook,
  isUserOrgMember: mocks.isUserOrgMember,
  listAgentOpsBrowserHostPlaybooks: mocks.listAgentOpsBrowserHostPlaybooks,
  updateAgentOpsBrowserHostPlaybookTrustState: mocks.updateAgentOpsBrowserHostPlaybookTrustState,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const playbookId = '55555555-5555-4555-8555-555555555555'

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

describe('/api/agent-ops/browser-host-playbooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.listAgentOpsBrowserHostPlaybooks.mockResolvedValue([])
    mocks.createAgentOpsBrowserHostPlaybook.mockResolvedValue({
      id: playbookId,
      orgId,
      projectId,
      hostPattern: 'app.example.com',
      title: 'Dashboard notes',
      bodyMd: 'Use the dashboard smoke path.',
      scope: 'project',
      trustState: 'quarantined',
    })
    mocks.updateAgentOpsBrowserHostPlaybookTrustState.mockResolvedValue({
      id: playbookId,
      trustState: 'active',
    })
  })

  it('lists host playbooks for a project and host', async () => {
    const response = await GET(request(
      `http://localhost:3000/api/agent-ops/browser-host-playbooks?org_id=${orgId}&project_id=${projectId}&host=app.example.com`,
    ))

    expect(response.status).toBe(200)
    expect(mocks.listAgentOpsBrowserHostPlaybooks).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      host: 'app.example.com',
    }))
  })

  it('creates quarantined host playbooks by default', async () => {
    const response = await POST(request('http://localhost:3000/api/agent-ops/browser-host-playbooks', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId,
        project_id: projectId,
        host_pattern: 'app.example.com',
        title: 'Dashboard notes',
        body_md: 'Use the dashboard smoke path.',
      }),
      headers: { 'content-type': 'application/json' },
    }) as NextRequest)

    expect(response.status).toBe(201)
    expect(mocks.createAgentOpsBrowserHostPlaybook).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      trustState: 'quarantined',
      createdByUserId: userId,
    }))
  })

  it('promotes host playbooks without coupling to a browser provider', async () => {
    const response = await PATCH(request(`http://localhost:3000/api/agent-ops/browser-host-playbooks/${playbookId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        org_id: orgId,
        action: 'promote',
      }),
      headers: { 'content-type': 'application/json' },
    }) as NextRequest, {
      params: Promise.resolve({ id: playbookId }),
    })

    expect(response.status).toBe(200)
    expect(mocks.updateAgentOpsBrowserHostPlaybookTrustState).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      playbookId,
      trustState: 'active',
    }))
  })
})
