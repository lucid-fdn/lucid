import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  getUserIdMock,
  isUserOrgMemberMock,
  getOrgMemberRoleMock,
  getProjectSummariesForWorkspaceMock,
  createProjectMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  isUserOrgMemberMock: vi.fn(),
  getOrgMemberRoleMock: vi.fn(),
  getProjectSummariesForWorkspaceMock: vi.fn(),
  createProjectMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: isUserOrgMemberMock,
  getOrgMemberRole: getOrgMemberRoleMock,
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectSummariesForWorkspace: getProjectSummariesForWorkspaceMock,
  createProject: createProjectMock,
}))

import { GET, POST } from '../route'

describe('/api/workspaces/[id]/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserIdMock.mockResolvedValue('user-1')
    isUserOrgMemberMock.mockResolvedValue(true)
    getOrgMemberRoleMock.mockResolvedValue('owner')
    getProjectSummariesForWorkspaceMock.mockResolvedValue([
      { id: 'project-1', slug: 'ops', name: 'Ops', is_default: false, counts: { assistants: 2, crews: 1, workflows: 0, templates: 3 } },
    ])
    createProjectMock.mockResolvedValue({ id: 'project-2', slug: 'ops', name: 'Ops' })
  })

  it('lists projects for a workspace member', async () => {
    const res = await GET(new Request('http://localhost/api/workspaces/org-1/projects') as any, {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toHaveLength(1)
  })

  it('creates a project for an allowed role', async () => {
    const res = await POST(new Request('http://localhost/api/workspaces/org-1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ops', description: 'Operations' }),
    }) as any, {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(201)
    expect(createProjectMock).toHaveBeenCalledWith({
      orgId: 'org-1',
      name: 'Ops',
      description: 'Operations',
      createdBy: 'user-1',
    })
  })

  it('rejects creation for insufficient role', async () => {
    getOrgMemberRoleMock.mockResolvedValue('member')
    const res = await POST(new Request('http://localhost/api/workspaces/org-1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ops' }),
    }) as any, {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(403)
  })
})
