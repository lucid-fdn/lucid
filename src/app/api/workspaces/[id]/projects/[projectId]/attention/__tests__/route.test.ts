import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  getUserIdMock,
  isUserOrgMemberMock,
  getProjectByIdForWorkspaceMock,
  getProjectAttentionDataMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  isUserOrgMemberMock: vi.fn(),
  getProjectByIdForWorkspaceMock: vi.fn(),
  getProjectAttentionDataMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: isUserOrgMemberMock,
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectByIdForWorkspace: getProjectByIdForWorkspaceMock,
}))

vi.mock('@/lib/projects/attention', () => ({
  getProjectAttentionData: getProjectAttentionDataMock,
}))

import { GET } from '../route'

describe('/api/workspaces/[id]/projects/[projectId]/attention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserIdMock.mockResolvedValue('user-1')
    isUserOrgMemberMock.mockResolvedValue(true)
    getProjectByIdForWorkspaceMock.mockResolvedValue({ id: 'project-1', slug: 'ops', name: 'Ops' })
    getProjectAttentionDataMock.mockResolvedValue({
      summary: {
        approvals: 2,
        failedRuns: 1,
        activeRuns: 3,
        openWorkItems: 4,
        criticalEvents: 1,
      },
    })
  })

  it('returns project attention summary for a workspace member', async () => {
    const res = await GET(new Request('http://localhost/api/workspaces/org-1/projects/project-1/attention') as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary).toEqual({
      approvals: 2,
      failedRuns: 1,
      activeRuns: 3,
      openWorkItems: 4,
      criticalEvents: 1,
    })
  })

  it('returns 404 when the project does not exist in the workspace', async () => {
    getProjectByIdForWorkspaceMock.mockResolvedValueOnce(null)
    const res = await GET(new Request('http://localhost/api/workspaces/org-1/projects/project-1/attention') as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(404)
  })
})
