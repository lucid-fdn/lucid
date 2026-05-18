import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: vi.fn(() => ({
    ready: true,
    authenticated: true,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn(),
  })),
}))

const {
  redirectMock,
  notFoundMock,
  requireUserIdMock,
  getUserIdMock,
  getWorkspaceWithAccessMock,
  getPrimaryProjectForWorkspaceMock,
  getDefaultProjectForWorkspaceMock,
  getProjectSummariesForWorkspaceMock,
  resolveWorkspaceProjectScopeMock,
  getAssistantMock,
  getAssistantsMock,
  getMCFeedEventsMock,
  getProjectByIdForWorkspaceMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  requireUserIdMock: vi.fn(),
  getUserIdMock: vi.fn(),
  getWorkspaceWithAccessMock: vi.fn(),
  getPrimaryProjectForWorkspaceMock: vi.fn(),
  getDefaultProjectForWorkspaceMock: vi.fn(),
  getProjectSummariesForWorkspaceMock: vi.fn(),
  resolveWorkspaceProjectScopeMock: vi.fn(),
  getAssistantMock: vi.fn(),
  getAssistantsMock: vi.fn(),
  getMCFeedEventsMock: vi.fn(),
  getProjectByIdForWorkspaceMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}))

vi.mock('@/lib/auth/server-utils', () => ({
  requireUserId: requireUserIdMock,
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/workspace', () => ({
  getWorkspaceWithAccess: getWorkspaceWithAccessMock,
}))

vi.mock('@/lib/db', () => ({
  getAssistant: getAssistantMock,
  getAssistants: getAssistantsMock,
  getMCFeedEvents: getMCFeedEventsMock,
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({ data: [] })),
        })),
      })),
    })),
  },
}))

vi.mock('@/lib/db/projects', () => ({
  getPrimaryProjectForWorkspace: getPrimaryProjectForWorkspaceMock,
  getDefaultProjectForWorkspace: getDefaultProjectForWorkspaceMock,
  getProjectSummariesForWorkspace: getProjectSummariesForWorkspaceMock,
  getProjectByIdForWorkspace: getProjectByIdForWorkspaceMock,
}))

vi.mock('@/lib/projects/scope', () => ({
  resolveWorkspaceProjectScope: resolveWorkspaceProjectScopeMock,
}))

vi.mock('@/components/dashboard/fleet-dashboard', () => ({
  FleetDashboard: () => 'FleetDashboard',
}))

vi.mock('@/components/projects/workspace-projects-browser', () => ({
  WorkspaceProjectsBrowser: () => 'WorkspaceProjectsBrowser',
}))

import WorkspaceDashboard from '../dashboard/page'
import MissionControlPage from '../mission-control/page'
import MissionControlAgentDetailPage from '../mission-control/agents/[agent-id]/page'
import MissionControlCanvasPage from '../mission-control/canvas/page'
import ProjectsIndexPage from '../projects/page'

describe('project-centered route redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUserIdMock.mockResolvedValue('user-1')
    getUserIdMock.mockResolvedValue('user-1')
    getWorkspaceWithAccessMock.mockResolvedValue({ id: 'org-1', slug: 'acme' })
    getPrimaryProjectForWorkspaceMock.mockResolvedValue({ id: 'project-1', name: 'Ops', slug: 'ops' })
    getDefaultProjectForWorkspaceMock.mockResolvedValue({ id: 'project-1', name: 'Ops', slug: 'ops' })
    getProjectSummariesForWorkspaceMock.mockResolvedValue([
      {
        id: 'project-1',
        org_id: 'org-1',
        name: 'Ops',
        slug: 'ops',
        description: null,
        is_default: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        created_by: 'user-1',
        updated_by: 'user-1',
        deleted_at: null,
        counts: { assistants: 0, crews: 0, workflows: 0, templates: 0 },
      },
    ])
    resolveWorkspaceProjectScopeMock.mockResolvedValue({
      workspace: { id: 'org-1', slug: 'acme' },
      project: { id: 'project-1', slug: 'ops' },
    })
    getProjectByIdForWorkspaceMock.mockResolvedValue({ id: 'project-2', slug: 'ops' })
    getAssistantMock.mockResolvedValue({ id: 'asst-1', org_id: 'org-1', project_id: 'project-2' })
    getAssistantsMock.mockResolvedValue([])
    getMCFeedEventsMock.mockResolvedValue([])
  })

  it('projects index calls notFound when workspace access fails', async () => {
    getWorkspaceWithAccessMock.mockResolvedValue(null)

    await expect(
      ProjectsIndexPage({ params: Promise.resolve({ 'workspace-slug': 'acme' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects empty projects index directly to project creation', async () => {
    getDefaultProjectForWorkspaceMock.mockResolvedValue(null)

    await expect(
      ProjectsIndexPage({ params: Promise.resolve({ 'workspace-slug': 'acme' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/new')
  })

  it('redirects projects index to the default project overview when projects already exist', async () => {
    await expect(
      ProjectsIndexPage({ params: Promise.resolve({ 'workspace-slug': 'acme' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/projects/ops')
  })

  it('redirects empty workspace dashboard directly to project creation', async () => {
    getPrimaryProjectForWorkspaceMock.mockResolvedValue(null)

    await expect(
      WorkspaceDashboard({ params: Promise.resolve({ 'workspace-slug': 'acme' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/new')

    expect(getAssistantsMock).not.toHaveBeenCalled()
  })

  it('renders workspace dashboard when a project already exists', async () => {
    const result = await WorkspaceDashboard({
      params: Promise.resolve({ 'workspace-slug': 'acme' }),
    })

    expect(result).toBeTruthy()
    expect(getAssistantsMock).toHaveBeenCalledWith('org-1')
    expect((result as React.ReactElement).props.children.props).toEqual(
      expect.objectContaining({
        workspaceSlug: 'acme',
        primaryProject: {
          name: 'Ops',
          slug: 'ops',
        },
      }),
    )
  })

  it('redirects mission-control root to the workspace operations overview', async () => {
    await expect(
      MissionControlPage({ params: Promise.resolve({ 'workspace-slug': 'acme' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/mission-control/overview')

    expect(getWorkspaceWithAccessMock).toHaveBeenCalledWith('acme', 'user-1')
    expect(getDefaultProjectForWorkspaceMock).not.toHaveBeenCalled()
  })

  it('redirects mission-control agent detail to the project-native agent route', async () => {
    await expect(
      MissionControlAgentDetailPage({ params: Promise.resolve({ 'workspace-slug': 'acme', 'agent-id': 'asst-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/projects/ops/agents/asst-1')
  })

  it('redirects mission-control canvas to the workspace operations overview', async () => {
    await expect(MissionControlCanvasPage({
      params: Promise.resolve({ 'workspace-slug': 'acme' }),
    })).rejects.toThrow('NEXT_REDIRECT:/acme/mission-control/overview')

    expect(getAssistantsMock).not.toHaveBeenCalled()
    expect(getMCFeedEventsMock).not.toHaveBeenCalled()
  })
})
