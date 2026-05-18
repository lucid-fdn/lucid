import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockGetUserId = vi.fn()
vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

const mockIsUserOrgMember = vi.fn()
vi.mock('@/lib/db', () => ({
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

const mockGetPrimaryProjectForWorkspace = vi.fn()
vi.mock('@/lib/db/projects', () => ({
  getPrimaryProjectForWorkspace: (...args: unknown[]) => mockGetPrimaryProjectForWorkspace(...args),
}))

const mockCompleteCrewRun = vi.fn()
const mockGetCrew = vi.fn()
const mockGetCrewRuns = vi.fn()
const mockGetCrewTopology = vi.fn()
const mockMarkCrewRunRunning = vi.fn()
const mockStartCrewRun = vi.fn()
const mockUpdateCrew = vi.fn()
vi.mock('@/lib/db/crews', () => ({
  completeCrewRun: (...args: unknown[]) => mockCompleteCrewRun(...args),
  getCrew: (...args: unknown[]) => mockGetCrew(...args),
  getCrewRuns: (...args: unknown[]) => mockGetCrewRuns(...args),
  getCrewTopology: (...args: unknown[]) => mockGetCrewTopology(...args),
  markCrewRunRunning: (...args: unknown[]) => mockMarkCrewRunRunning(...args),
  startCrewRun: (...args: unknown[]) => mockStartCrewRun(...args),
  updateCrew: (...args: unknown[]) => mockUpdateCrew(...args),
}))

const mockSendCrewRunStartEvent = vi.fn()
vi.mock('@/lib/db/crew-run-orchestration', () => ({
  sendCrewRunStartEvent: (...args: unknown[]) => mockSendCrewRunStartEvent(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

describe('POST /api/crews/[id]/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserId.mockResolvedValue('user-1')
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetPrimaryProjectForWorkspace.mockResolvedValue({ id: 'project-1' })
    mockGetCrew.mockResolvedValue({
      id: 'crew-1',
      name: 'Crew One',
      objective: 'Ship it',
      status: 'active',
    })
    mockGetCrewTopology.mockResolvedValue({
      members: [
        {
          assistant_id: 'assistant-1',
          assistant_name: 'Coordinator',
          member_ref_id: 'member-1',
          role: 'lead',
          is_coordinator: true,
        },
      ],
    })
    mockStartCrewRun.mockResolvedValue('run-1')
    mockMarkCrewRunRunning.mockResolvedValue(true)
    mockCompleteCrewRun.mockResolvedValue(true)
  })

  it('rolls back the run when kickoff insert fails after markCrewRunRunning', async () => {
    // Route ordering is intentional: markCrewRunRunning BEFORE
    // sendCrewRunStartEvent, to prevent split-brain between crew_runs
    // and the durable inbound event. See route.ts line 104-111. So a
    // kickoff failure happens with the run already in `running` state,
    // and the error handler must roll it back via completeCrewRun('failed').
    mockSendCrewRunStartEvent.mockRejectedValue(new Error('kickoff insert failed'))

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/crews/crew-1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: 'org-1' }),
    })

    const res = await POST(req as never, { params: Promise.resolve({ id: 'crew-1' }) })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to start crew run')
    expect(mockStartCrewRun).toHaveBeenCalledWith('crew-1', 'org-1', 'manual', 'user-1')
    expect(mockMarkCrewRunRunning).toHaveBeenCalledWith('run-1')
    expect(mockCompleteCrewRun).toHaveBeenCalledWith(
      'run-1',
      'failed',
      undefined,
      'kickoff_failed: kickoff insert failed',
    )
  }, 15_000)
})
