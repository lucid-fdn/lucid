import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  getUserIdMock,
  isUserOrgMemberMock,
  getOrgMemberRoleMock,
  getProjectByIdForWorkspaceMock,
  updateProjectMock,
  upsertProjectSettingsMock,
  archiveProjectMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  isUserOrgMemberMock: vi.fn(),
  getOrgMemberRoleMock: vi.fn(),
  getProjectByIdForWorkspaceMock: vi.fn(),
  updateProjectMock: vi.fn(),
  upsertProjectSettingsMock: vi.fn(),
  archiveProjectMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: isUserOrgMemberMock,
  getOrgMemberRole: getOrgMemberRoleMock,
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectByIdForWorkspace: getProjectByIdForWorkspaceMock,
  updateProject: updateProjectMock,
  upsertProjectSettings: upsertProjectSettingsMock,
  archiveProject: archiveProjectMock,
}))

import { GET, PATCH } from '../route'

describe('/api/workspaces/[id]/projects/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserIdMock.mockResolvedValue('user-1')
    isUserOrgMemberMock.mockResolvedValue(true)
    getOrgMemberRoleMock.mockResolvedValue('owner')
    getProjectByIdForWorkspaceMock.mockResolvedValue({ id: 'project-1', slug: 'ops', name: 'Ops' })
    updateProjectMock.mockResolvedValue({ id: 'project-1', slug: 'ops', name: 'Renamed Project' })
    upsertProjectSettingsMock.mockResolvedValue({
      project_id: 'project-1',
      org_id: 'org-1',
      preferred_runtime: 'shared',
      approval_policy: 'human_in_loop',
      mutation_policy: 'review',
      default_creation_mode: 'template_first',
    })
    archiveProjectMock.mockResolvedValue(true)
  })

  it('returns project detail for a workspace member', async () => {
    const res = await GET(new Request('http://localhost/api/workspaces/org-1/projects/project-1') as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.id).toBe('project-1')
  })

  it('updates project metadata for an allowed role', async () => {
    const res = await PATCH(new Request('http://localhost/api/workspaces/org-1/projects/project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    }) as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(200)
    expect(updateProjectMock).toHaveBeenCalledWith('org-1', 'project-1', {
      name: 'Renamed',
      description: undefined,
      updatedBy: 'user-1',
    })
  })

  it('archives a project for owner/admin roles', async () => {
    const res = await PATCH(new Request('http://localhost/api/workspaces/org-1/projects/project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archive: true }),
    }) as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(200)
    expect(archiveProjectMock).toHaveBeenCalledWith('org-1', 'project-1', 'user-1')
  })

  it('updates project settings defaults for an allowed role', async () => {
    const res = await PATCH(new Request('http://localhost/api/workspaces/org-1/projects/project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          preferredRuntime: 'shared',
          approvalPolicy: 'human_in_loop',
          mutationPolicy: 'review',
          defaultCreationMode: 'template_first',
        },
      }),
    }) as any, {
      params: Promise.resolve({ id: 'org-1', projectId: 'project-1' }),
    })
    expect(res.status).toBe(200)
    expect(upsertProjectSettingsMock).toHaveBeenCalledWith('org-1', 'project-1', {
      preferredRuntime: 'shared',
      approvalPolicy: 'human_in_loop',
      mutationPolicy: 'review',
      defaultCreationMode: 'template_first',
      updatedBy: 'user-1',
    })
  })
})
