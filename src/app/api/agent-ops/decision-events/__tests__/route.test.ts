import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  listAgentOpsDecisionEvents: vi.fn(),
  recordAgentOpsDecisionEvent: vi.fn(),
  flipAgentOpsDecisionEvent: vi.fn(),
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
  flipAgentOpsDecisionEvent: mocks.flipAgentOpsDecisionEvent,
  isUserOrgMember: mocks.isUserOrgMember,
  listAgentOpsDecisionEvents: mocks.listAgentOpsDecisionEvents,
  recordAgentOpsDecisionEvent: mocks.recordAgentOpsDecisionEvent,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET, POST } from '../route'
import { POST as FLIP } from '../[id]/flip/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const eventId = '55555555-5555-4555-8555-555555555555'
const userId = '66666666-6666-4666-8666-666666666666'

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

describe('/api/agent-ops/decision-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.listAgentOpsDecisionEvents.mockResolvedValue([])
    mocks.recordAgentOpsDecisionEvent.mockResolvedValue({
      id: eventId,
      orgId,
      projectId,
      runId,
      questionId: 'browser-mutation',
      doorType: 'one_way',
      decisionMode: 'asked',
    })
    mocks.flipAgentOpsDecisionEvent.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      orgId,
      questionId: 'docs-copy-style',
      decisionMode: 'flipped',
    })
  })

  it('lists decision events through org membership and bounded filters', async () => {
    const response = await GET(request(
      `http://localhost:3000/api/agent-ops/decision-events?org_id=${orgId}&project_id=${projectId}&run_id=${runId}&decision_mode=silent_decision`,
    ))

    expect(response.status).toBe(200)
    expect(mocks.listAgentOpsDecisionEvents).toHaveBeenCalledWith({
      orgId,
      projectId,
      runId,
      decisionMode: 'silent_decision',
      limit: 100,
    })
  })

  it('records one-way decisions as visible asked events', async () => {
    const response = await POST(request('http://localhost:3000/api/agent-ops/decision-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        project_id: projectId,
        run_id: runId,
        phase: 'execute',
        question_id: 'browser-mutation',
        door_type: 'one_way',
        decision_mode: 'silent_decision',
        question: 'Should Browser Operator perform a mutating action?',
        selected_option: { id: 'ask', label: 'Ask first' },
        metadata: {},
      }),
    }) as NextRequest)

    expect(response.status).toBe(201)
    expect(mocks.recordAgentOpsDecisionEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      runId,
      questionId: 'browser-mutation',
      doorType: 'one_way',
      decisionMode: 'asked',
      reversible: false,
      createdByUserId: userId,
    }))
  })

  it('flips reversible decisions through append-only events', async () => {
    const response = await FLIP(request(`http://localhost:3000/api/agent-ops/decision-events/${eventId}/flip`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        selected_option: { id: 'technical', label: 'Technical' },
        reason: 'Need implementation details.',
      }),
    }) as NextRequest, {
      params: Promise.resolve({ id: eventId }),
    })

    expect(response.status).toBe(201)
    expect(mocks.flipAgentOpsDecisionEvent).toHaveBeenCalledWith({
      orgId,
      eventId,
      selectedOption: { id: 'technical', label: 'Technical' },
      reason: 'Need implementation details.',
      createdByUserId: userId,
    })
  })
})
