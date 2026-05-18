import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  getUserIdMock,
  getWorkspaceMock,
  setWorkspaceScopeMock,
  getProjectByIdForWorkspaceMock,
  getDefaultEnvironmentForProjectMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  getWorkspaceMock: vi.fn(),
  setWorkspaceScopeMock: vi.fn(),
  getProjectByIdForWorkspaceMock: vi.fn(),
  getDefaultEnvironmentForProjectMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  getWorkspace: getWorkspaceMock,
  setWorkspaceScope: setWorkspaceScopeMock,
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectByIdForWorkspace: getProjectByIdForWorkspaceMock,
  getDefaultEnvironmentForProject: getDefaultEnvironmentForProjectMock,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: captureExceptionMock },
}))

import { GET } from '../route'

describe('GET /api/workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserIdMock.mockResolvedValue('user-1')
    getWorkspaceMock.mockResolvedValue({
      org: { id: 'org-1', name: 'Acme', slug: 'acme' },
      project: { id: 'project-ops', name: 'Ops', slug: 'ops', is_default: false },
      env: { id: 'env-prod', name: 'production', is_default: true },
      favorites: [],
    })
    setWorkspaceScopeMock.mockResolvedValue(undefined)
    getProjectByIdForWorkspaceMock.mockResolvedValue({
      id: 'project-2',
      name: 'Ops',
      slug: 'ops',
      is_default: false,
    })
    getDefaultEnvironmentForProjectMock.mockResolvedValue({
      id: 'env-stage',
      name: 'staging',
      is_default: true,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    getUserIdMock.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/workspace?org_id=org-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when org_id is missing', async () => {
    const res = await GET(new Request('http://localhost/api/workspace'))
    expect(res.status).toBe(400)
  })

  it('returns the primary workspace scope when project_id is omitted', async () => {
    const res = await GET(new Request('http://localhost/api/workspace?org_id=org-1'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.project.slug).toBe('ops')
    expect(setWorkspaceScopeMock).toHaveBeenCalledWith('org-1', 'project-ops', 'env-prod')
  })

  it('does not set scoped ids when the workspace has no project yet', async () => {
    getWorkspaceMock.mockResolvedValue({
      org: { id: 'org-1', name: 'Acme', slug: 'acme' },
      project: null,
      env: null,
      favorites: [],
    })

    const res = await GET(new Request('http://localhost/api/workspace?org_id=org-1'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.project).toBeNull()
    expect(body.env).toBeNull()
    expect(setWorkspaceScopeMock).not.toHaveBeenCalled()
  })

  it('returns the requested project scope when project_id is provided', async () => {
    const res = await GET(new Request('http://localhost/api/workspace?org_id=org-1&project_id=project-2'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.project).toEqual({
      id: 'project-2',
      name: 'Ops',
      slug: 'ops',
      is_default: false,
      agent_count: 0,
    })
    expect(body.env).toEqual({
      id: 'env-stage',
      name: 'staging',
      is_default: true,
    })
    expect(setWorkspaceScopeMock).toHaveBeenCalledWith('org-1', 'project-2', 'env-stage')
  })
})
