import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  claimNextAgentAvatarGenerationJobs: vi.fn(),
  processClaimedAgentAvatarGenerationJob: vi.fn(),
  serializeAgentAvatarJob: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/ai/agent-avatar/jobs', () => ({
  claimNextAgentAvatarGenerationJobs: mocks.claimNextAgentAvatarGenerationJobs,
  processClaimedAgentAvatarGenerationJob: mocks.processClaimedAgentAvatarGenerationJob,
  serializeAgentAvatarJob: mocks.serializeAgentAvatarJob,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: mocks.captureException },
}))

import { POST } from '../route'

describe('POST /api/internal/agent-avatar-jobs/process-next', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKER_TRIGGER_SECRET = 'worker-secret'
  })

  it('rejects unauthenticated worker calls', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/agent-avatar-jobs/process-next', {
      method: 'POST',
      body: JSON.stringify({}),
    }))

    expect(response.status).toBe(401)
    expect(mocks.claimNextAgentAvatarGenerationJobs).not.toHaveBeenCalled()
  })

  it('claims and processes avatar jobs for the worker', async () => {
    const job = { id: 'job-1', status: 'running' }
    const processed = { ...job, status: 'succeeded' }
    const serialized = { id: 'job-1', status: 'succeeded' }
    mocks.claimNextAgentAvatarGenerationJobs.mockResolvedValue([job])
    mocks.processClaimedAgentAvatarGenerationJob.mockResolvedValue(processed)
    mocks.serializeAgentAvatarJob.mockReturnValue(serialized)

    const response = await POST(new NextRequest('http://localhost/api/internal/agent-avatar-jobs/process-next', {
      method: 'POST',
      headers: { authorization: 'Bearer worker-secret' },
      body: JSON.stringify({ workerId: 'worker-1', limit: 2, staleAfterSeconds: 120 }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.claimNextAgentAvatarGenerationJobs).toHaveBeenCalledWith({
      workerId: 'worker-1',
      limit: 2,
      staleAfterSeconds: 120,
    })
    expect(mocks.processClaimedAgentAvatarGenerationJob).toHaveBeenCalledWith(job)
    expect(payload).toEqual({ data: { claimed: 1, processed: 1, jobs: [serialized] } })
  })
})
