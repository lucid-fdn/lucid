import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))

const {
  requireUserIdMock,
  resolveWorkspaceProjectScopeMock,
  getProjectResourceCountsMock,
  getProjectSettingsMock,
  getAssistantsByProjectMock,
  findKnowledgeEntitiesMock,
  getMCFeedEventsMock,
  getPendingApprovalsMock,
  listKnowledgeMaintenanceEventsMock,
  listKnowledgePagesMock,
  listDeployableTemplateCatalogEntriesMock,
  getUnifiedSkillsForOrgMock,
  getCrewsByProjectMock,
  getCrewRunsMock,
  getProjectAttentionDataMock,
  getProjectWorkDataMock,
  getProjectWorkDetailDataMock,
  getWorkspaceCapabilitiesMock,
  isInternalOrgMock,
  isInternalWorkspaceMock,
  redirectMock,
  useRouterMock,
  usePathnameMock,
} = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  resolveWorkspaceProjectScopeMock: vi.fn(),
  getProjectResourceCountsMock: vi.fn(),
  getProjectSettingsMock: vi.fn(),
  getAssistantsByProjectMock: vi.fn(),
  findKnowledgeEntitiesMock: vi.fn(),
  getMCFeedEventsMock: vi.fn(),
  getPendingApprovalsMock: vi.fn(),
  listKnowledgeMaintenanceEventsMock: vi.fn(),
  listKnowledgePagesMock: vi.fn(),
  listDeployableTemplateCatalogEntriesMock: vi.fn(),
  getUnifiedSkillsForOrgMock: vi.fn(),
  getCrewsByProjectMock: vi.fn(),
  getCrewRunsMock: vi.fn(),
  getProjectAttentionDataMock: vi.fn(),
  getProjectWorkDataMock: vi.fn(),
  getProjectWorkDetailDataMock: vi.fn(),
  getWorkspaceCapabilitiesMock: vi.fn(),
  isInternalOrgMock: vi.fn(),
  isInternalWorkspaceMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  useRouterMock: vi.fn(() => ({
    refresh: vi.fn(),
    push: vi.fn(),
  })),
  usePathnameMock: vi.fn(() => '/acme/projects/ops'),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: redirectMock,
  useRouter: useRouterMock,
  usePathname: usePathnameMock,
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

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

vi.mock('@/lib/auth/server-utils', () => ({
  requireUserId: requireUserIdMock,
}))

vi.mock('@/lib/projects/scope', () => ({
  resolveWorkspaceProjectScope: resolveWorkspaceProjectScopeMock,
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectResourceCounts: getProjectResourceCountsMock,
  getProjectSettings: getProjectSettingsMock,
}))

vi.mock('@/lib/db', () => ({
  getAssistantsByProject: getAssistantsByProjectMock,
  findKnowledgeEntities: findKnowledgeEntitiesMock,
  getMCFeedEvents: getMCFeedEventsMock,
  getPendingApprovals: getPendingApprovalsMock,
  listKnowledgeMaintenanceEvents: listKnowledgeMaintenanceEventsMock,
  listKnowledgePages: listKnowledgePagesMock,
}))

vi.mock('@/lib/templates/library-server', () => ({
  listDeployableTemplateCatalogEntries: listDeployableTemplateCatalogEntriesMock,
}))

vi.mock('@/lib/db/unified-skills', () => ({
  getUnifiedSkillsForOrg: getUnifiedSkillsForOrgMock,
}))

vi.mock('@/lib/db/crews', () => ({
  getCrewsByProject: getCrewsByProjectMock,
  getCrewRuns: getCrewRunsMock,
}))

vi.mock('@/lib/projects/attention', () => ({
  getProjectAttentionData: getProjectAttentionDataMock,
}))

vi.mock('@/lib/projects/work', () => ({
  getProjectWorkData: getProjectWorkDataMock,
  getProjectWorkDetailData: getProjectWorkDetailDataMock,
}))

vi.mock('@/lib/workspace/capabilities', () => ({
  getWorkspaceCapabilities: getWorkspaceCapabilitiesMock,
}))

vi.mock('@/lib/auth/internal', () => ({
  isInternalOrg: isInternalOrgMock,
  isInternalWorkspace: isInternalWorkspaceMock,
}))

vi.mock('@/components/agents/agents-page-shell', () => ({
  AgentsPageShell: (props: Record<string, unknown>) => (
    <div data-testid="assistants-client">{JSON.stringify(props)}</div>
  ),
}))

vi.mock('../../../templates/workspace-templates-page', () => ({
  WorkspaceTemplatesPage: (props: Record<string, unknown>) => (
    <div data-testid="templates-page">{JSON.stringify(props)}</div>
  ),
}))

vi.mock('@/components/teams/crews-list-client', () => ({
  CrewsListClient: (props: Record<string, unknown>) => (
    <div data-testid="crews-list-client">{JSON.stringify(props)}</div>
  ),
}))

vi.mock('@/components/teams/crew-detail-client', () => ({
  CrewDetailClient: (props: Record<string, unknown>) => (
    <div data-testid="crew-detail-client">{JSON.stringify(props)}</div>
  ),
}))

import ProjectCanvasPage from '../canvas/page'
import ProjectOverviewPage from '../page'
import ProjectAgentsPage from '../agents/page'
import ProjectInboxPage from '../inbox/page'
import ProjectWorkPage from '../work/page'
import ProjectWorkDetailPage from '../work/[item-id]/page'
import ProjectTeamsPage from '../teams/page'
import ProjectTeamDetailPage from '../teams/[id]/page'
import ProjectRunsPage from '../runs/page'
import ProjectResourcesPage from '../resources/page'
import ProjectTemplatesPage from '../templates/page'
import ProjectSettingsPage from '../settings/page'

describe('project shell pages smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUserIdMock.mockResolvedValue('user-1')
    resolveWorkspaceProjectScopeMock.mockResolvedValue({
      workspace: { id: 'org-1', slug: 'acme', name: 'Acme' },
      project: {
        id: 'project-1',
        slug: 'ops',
        name: 'Ops',
        is_default: false,
        updated_at: '2026-04-14T10:00:00.000Z',
      },
    })
    getProjectResourceCountsMock.mockResolvedValue({
      assistants: 2,
      crews: 1,
      workflows: 3,
      templates: 4,
    })
    getProjectSettingsMock.mockResolvedValue({
      project_id: 'project-1',
      org_id: 'org-1',
      preferred_runtime: 'auto',
      approval_policy: 'human_in_loop',
      mutation_policy: 'review',
      default_creation_mode: 'template_first',
      created_at: '2026-04-23T00:00:00.000Z',
      updated_at: '2026-04-23T00:00:00.000Z',
      created_by: 'user-1',
      updated_by: 'user-1',
    })
    getAssistantsByProjectMock.mockResolvedValue([{ id: 'asst-1', name: 'Alpha' }])
    findKnowledgeEntitiesMock.mockResolvedValue([])
    getMCFeedEventsMock.mockResolvedValue([])
    getPendingApprovalsMock.mockResolvedValue([])
    listKnowledgeMaintenanceEventsMock.mockResolvedValue([])
    listKnowledgePagesMock.mockResolvedValue([])
    listDeployableTemplateCatalogEntriesMock.mockResolvedValue([])
    getUnifiedSkillsForOrgMock.mockResolvedValue([])
    getCrewsByProjectMock.mockResolvedValue([])
    getCrewRunsMock.mockResolvedValue([])
    getProjectAttentionDataMock.mockResolvedValue({
      assistants: [{ id: 'asst-1', name: 'Alpha' }],
      projectAgentIds: ['asst-1'],
      pendingApprovals: [],
      failedEvents: [],
      criticalEvents: [],
      openWorkItems: [],
      readyWorkItems: [],
      blockedWorkItems: [],
      livenessIncidents: [],
      activeCrewRuns: [],
      failedCrewRuns: [],
      recentCrewRuns: [],
      summary: {
        approvals: 0,
        failedRuns: 0,
        activeRuns: 0,
        openWorkItems: 0,
        readyWorkItems: 0,
        blockedWorkItems: 0,
        livenessIncidents: 0,
        criticalEvents: 0,
      },
    })
    getProjectWorkDataMock.mockResolvedValue({
      agents: [{ id: 'asst-1', name: 'Alpha' }],
      agentIds: ['asst-1'],
      items: [],
      livenessIncidents: [],
      summary: {
        open: 0,
        inProgress: 0,
        waiting: 0,
        overdue: 0,
        approvals: 0,
        ready: 0,
        claimed: 0,
        blocked: 0,
        stalled: 0,
      },
    })
    getProjectWorkDetailDataMock.mockResolvedValue({
      agents: [{ id: 'asst-1', name: 'Alpha' }],
      agentIds: ['asst-1'],
      items: [],
      livenessIncidents: [],
      item: {
        id: 'work-1',
        pulse_job_run_id: 'run-1',
        agent_id: 'asst-1',
        title: 'Review approval',
        description: 'Review approval detail',
        status: 'open',
        priority: 'high',
        kind: 'pulse_standalone',
        labels: ['approval'],
        due_at: null,
        signal: {
          state: 'ready',
          reason: 'ready_unassigned',
          label: 'Ready for claim',
          detail: 'This work item is ready for an operator to claim.',
          severity: 'info',
          readyForOperator: true,
          stalled: false,
        },
      },
      events: [],
      dagContext: null,
      linkedRunEvents: [],
      summary: {
        open: 1,
        inProgress: 0,
        waiting: 0,
        overdue: 0,
        approvals: 1,
        ready: 1,
        claimed: 0,
        blocked: 0,
        stalled: 0,
      },
    })
    getWorkspaceCapabilitiesMock.mockResolvedValue({
      planName: 'pro',
      role: 'owner',
      gatewayKeysState: 'active',
      canManageGatewayKeys: true,
      canViewAudit: true,
    })
    isInternalOrgMock.mockReturnValue(false)
    isInternalWorkspaceMock.mockReturnValue(false)
  })

  it('redirects the legacy project canvas route to agents canvas view', async () => {
    await expect(ProjectCanvasPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
      searchParams: Promise.resolve({ agent: 'asst-1', focus: 'created' }),
    })).rejects.toThrow('NEXT_REDIRECT:/acme/projects/ops/agents?view=canvas&agent=asst-1&focus=created')
  })

  it('renders the project overview shell', async () => {
    const html = renderToStaticMarkup(await ProjectOverviewPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('First Proof')
    expect(html).toContain('Runtime Paths')
    expect(html).toContain('Quick Actions')
    expect(html).toContain('Open Agents')
    expect(html).toContain('Recent Activity')
  })

  it('renders the agents inventory shell', async () => {
    const html = renderToStaticMarkup(await ProjectAgentsPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('assistants-client')
    expect(html).toContain('&quot;projectSlug&quot;:&quot;ops&quot;')
    expect(html).toContain('&quot;initialViewMode&quot;:&quot;canvas&quot;')
  })

  it('renders the project inbox attention surface', async () => {
    const html = renderToStaticMarkup(await ProjectInboxPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('Inbox')
    expect(html).toContain('Gathering project attention signals')
    expect(html).toContain('Loading approvals and work')
  })

  it('renders the project work surface', async () => {
    const html = renderToStaticMarkup(await ProjectWorkPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('Project Work Queue')
    expect(html).toContain('Scoped to agents currently assigned')
    expect(html).toContain('Ready Now')
  })

  it('renders the project work detail surface', async () => {
    const html = renderToStaticMarkup(await ProjectWorkDetailPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops', 'item-id': 'work-1' }),
    }))
    expect(html).toContain('Selected Work Item')
    expect(html).toContain('Operator Actions')
    expect(html).toContain('Blockers &amp; Approval Bridge')
    expect(html).toContain('Continuation Handoff')
    expect(html).toContain('Event Timeline')
    expect(html).toContain('Linked Run Narrative')
    expect(html).toContain('Artifacts &amp; Outputs')
    expect(html).toContain('Readiness')
    expect(html).toContain('No work-item events have been recorded yet')
  })

  it('renders the first-proof continuity banner on work detail when sourced from agent creation', async () => {
    const html = renderToStaticMarkup(await ProjectWorkDetailPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops', 'item-id': 'work-1' }),
      searchParams: Promise.resolve({ source: 'create-agent' }),
    }))
    expect(html).toContain('First Proof')
    expect(html).toContain('No work receipts yet')
    expect(html).toContain('Open work queue')
    expect(html).toContain('Review project runs')
  })

  it('renders the teams inventory shell', async () => {
    const html = renderToStaticMarkup(await ProjectTeamsPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('crews-list-client')
    expect(html).toContain('&quot;projectSlug&quot;:&quot;ops&quot;')
  })

  it('renders the project team detail shell with assistants', async () => {
    const html = renderToStaticMarkup(await ProjectTeamDetailPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops', id: 'crew-1' }),
    }))
    expect(html).toContain('crew-detail-client')
    expect(html).toContain('&quot;projectSlug&quot;:&quot;ops&quot;')
    expect(html).toContain('&quot;assistants&quot;')
  })

  it('renders the runs page summary cards', async () => {
    const html = renderToStaticMarkup(await ProjectRunsPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('Runs are the receipts for this project')
    expect(html).toContain('Fleet Activity')
    expect(html).toContain('Recent Team Runs')
  })

  it('redirects the legacy resources route to agents', async () => {
    await expect(
      ProjectResourcesPage({
        params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/projects/ops/agents')
  })

  it('renders the templates page with project scope', async () => {
    const html = renderToStaticMarkup(await ProjectTemplatesPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('templates-page')
    expect(html).toContain('&quot;projectId&quot;:&quot;project-1&quot;')
  })

  it('renders the settings page metadata', async () => {
    const html = renderToStaticMarkup(await ProjectSettingsPage({
      params: Promise.resolve({ 'workspace-slug': 'acme', 'project-slug': 'ops' }),
    }))
    expect(html).toContain('Project Settings')
    expect(html).toContain('Save changes')
    expect(html).toContain('Danger Zone')
  })
})
