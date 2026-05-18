/**
 * POST /api/crews/[id]/runs — kickoff transactional safety.
 *
 * The route must NOT leave a crew run sitting in `running` if the synthetic
 * inbound event to the coordinator can't be enqueued. We rely on awaiting
 * sendCrewRunStartEvent and rolling back via completeCrewRun on failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockGetUserId = vi.fn().mockResolvedValue('user-1')
vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: () => mockGetUserId(),
}))

const mockIsUserOrgMember = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/db', () => ({
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

const mockGetPrimaryProjectForWorkspace = vi.fn().mockResolvedValue({ id: 'project-1' })
vi.mock('@/lib/db/projects', () => ({
  getPrimaryProjectForWorkspace: (...args: unknown[]) => mockGetPrimaryProjectForWorkspace(...args),
}))

const mockGetCrew = vi.fn()
const mockGetCrewTopology = vi.fn()
const mockStartCrewRun = vi.fn()
const mockMarkCrewRunRunning = vi.fn().mockResolvedValue(true)
const mockUpdateCrew = vi.fn().mockResolvedValue(true)
const mockCompleteCrewRun = vi.fn().mockResolvedValue(true)
const mockGetCrewRuns = vi.fn().mockResolvedValue([])
vi.mock('@/lib/db/crews', () => ({
  getCrew: (...args: unknown[]) => mockGetCrew(...args),
  getCrewTopology: (...args: unknown[]) => mockGetCrewTopology(...args),
  startCrewRun: (...args: unknown[]) => mockStartCrewRun(...args),
  markCrewRunRunning: (...args: unknown[]) => mockMarkCrewRunRunning(...args),
  updateCrew: (...args: unknown[]) => mockUpdateCrew(...args),
  completeCrewRun: (...args: unknown[]) => mockCompleteCrewRun(...args),
  getCrewRuns: (...args: unknown[]) => mockGetCrewRuns(...args),
}))

const mockSendCrewRunStartEvent = vi.fn()
vi.mock('@/lib/db/crew-run-orchestration', () => ({
  sendCrewRunStartEvent: (...args: unknown[]) => mockSendCrewRunStartEvent(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '@/app/api/crews/[id]/runs/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown> = { org_id: 'org-1' }): NextRequest {
  return new NextRequest('http://localhost/api/crews/crew-1/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'crew-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserId.mockResolvedValue('user-1')
  mockIsUserOrgMember.mockResolvedValue(true)
  mockGetPrimaryProjectForWorkspace.mockResolvedValue({ id: 'project-1' })
  mockGetCrew.mockResolvedValue({
    id: 'crew-1',
    name: 'Alpha',
    objective: 'Research',
    status: 'active',
  })
  mockGetCrewTopology.mockResolvedValue({
    members: [
      {
        assistant_id: 'ast-coord',
        member_ref_id: 'ast-coord',
        assistant_name: 'Coordinator',
        role: 'coordinator',
        is_coordinator: true,
      },
      {
        assistant_id: 'ast-worker',
        member_ref_id: 'ast-worker',
        assistant_name: 'Worker',
        role: 'researcher',
        is_coordinator: false,
      },
    ],
  })
  mockStartCrewRun.mockResolvedValue('run-123')
  mockMarkCrewRunRunning.mockResolvedValue(true)
  mockSendCrewRunStartEvent.mockResolvedValue(undefined)
})

describe('POST /api/crews/[id]/runs — kickoff transactional safety', () => {
  it('returns 201 on happy path and awaits the kickoff', async () => {
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.run_id).toBe('run-123')
    expect(mockSendCrewRunStartEvent).toHaveBeenCalledTimes(1)
    expect(mockCompleteCrewRun).not.toHaveBeenCalled()
  })

  it('rolls back the run as failed and surfaces 500 if kickoff throws', async () => {
    mockSendCrewRunStartEvent.mockRejectedValueOnce(new Error('coordinator channel down'))

    const res = await POST(makeRequest(), { params })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to start crew run')
    expect(json.detail).toContain('coordinator channel down')

    // Critical: the run is marked failed, not left dangling for the reconciler.
    expect(mockCompleteCrewRun).toHaveBeenCalledWith(
      'run-123',
      'failed',
      undefined,
      expect.stringContaining('kickoff_failed'),
    )
  })

  it('still returns 500 if both kickoff and rollback fail (does not throw)', async () => {
    mockSendCrewRunStartEvent.mockRejectedValueOnce(new Error('kickoff blew up'))
    mockCompleteCrewRun.mockRejectedValueOnce(new Error('rollback also blew up'))

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to start crew run')
  })

  it('does not enqueue kickoff if markCrewRunRunning fails (no split-brain)', async () => {
    mockMarkCrewRunRunning.mockResolvedValueOnce(false)

    const res = await POST(makeRequest(), { params })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.detail).toBe('state_transition_failed')
    // Critical: kickoff must NOT have run. Previously the route enqueued the
    // coordinator briefing first and then tried to mark running — a failed
    // transition left the durable inbound event in place and the coordinator
    // would happily execute a run the API just marked failed.
    expect(mockSendCrewRunStartEvent).not.toHaveBeenCalled()
    expect(mockCompleteCrewRun).toHaveBeenCalledWith(
      'run-123',
      'failed',
      undefined,
      'state_transition_failed',
    )
  })

  it('refuses when there is no coordinator', async () => {
    mockGetCrewTopology.mockResolvedValueOnce({
      members: [
        {
          assistant_id: 'ast-1',
          member_ref_id: 'ast-1',
          assistant_name: 'Worker',
          role: 'researcher',
          is_coordinator: false,
        },
      ],
    })

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(400)
    expect(mockStartCrewRun).not.toHaveBeenCalled()
    expect(mockSendCrewRunStartEvent).not.toHaveBeenCalled()
  })
})
