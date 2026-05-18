import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCreateProject = vi.fn()
const mockGetDefaultEnvironmentForProject = vi.fn()
const mockGetProjectByIdForWorkspace = vi.fn()
const mockGetPrimaryProjectForWorkspace = vi.fn()
const mockGetDeployableTemplateCatalogEntry = vi.fn()
const mockDeployAgentSpec = vi.fn()
const mockDeployTeamSpec = vi.fn()
const mockDeployResolvedTemplate = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@/lib/db/projects', () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  getDefaultEnvironmentForProject: (...args: unknown[]) => mockGetDefaultEnvironmentForProject(...args),
  getProjectByIdForWorkspace: (...args: unknown[]) => mockGetProjectByIdForWorkspace(...args),
  getPrimaryProjectForWorkspace: (...args: unknown[]) => mockGetPrimaryProjectForWorkspace(...args),
}))

vi.mock('@/lib/templates/library-server', () => ({
  getDeployableTemplateCatalogEntry: (...args: unknown[]) => mockGetDeployableTemplateCatalogEntry(...args),
}))

vi.mock('@/lib/templates/deploy', () => ({
  deployAgentSpec: (...args: unknown[]) => mockDeployAgentSpec(...args),
  deployTeamSpec: (...args: unknown[]) => mockDeployTeamSpec(...args),
  deployResolvedTemplate: (...args: unknown[]) => mockDeployResolvedTemplate(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

const blueprintModule = await import('./blueprint-deploy')

describe('deployProjectBlueprint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPrimaryProjectForWorkspace.mockResolvedValue({ id: 'project-primary', slug: 'ops' })
    mockGetDefaultEnvironmentForProject.mockResolvedValue({ id: 'env-default' })
  })

  it('deploys a blank agent blueprint into an explicit project scope', async () => {
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'support-ops' })
    mockGetDefaultEnvironmentForProject.mockResolvedValue({ id: 'env-1' })
    mockDeployAgentSpec.mockResolvedValue('assistant-1')

    const result = await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Support Ops' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Support Agent',
            spec: {
              kind: 'agent',
              system_prompt: 'You run support.',
            },
          },
        ],
      },
      'org-1',
      'user-1',
      { projectId: 'project-1' },
    )

    expect(mockDeployAgentSpec).toHaveBeenCalledWith(
      { kind: 'agent', system_prompt: 'You run support.' },
      {},
      'org-1',
      'user-1',
      expect.objectContaining({
        nameOverride: 'Support Agent',
        scope: expect.objectContaining({ projectId: 'project-1', envId: 'env-1' }),
      }),
    )
    expect(result.primary).toEqual({ kind: 'agent', assistantId: 'assistant-1' })
    expect(result.projectSlug).toBe('support-ops')
  })

  it('propagates blueprint runtime and engine settings for blank agents', async () => {
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'support-ops' })
    mockGetDefaultEnvironmentForProject.mockResolvedValue({ id: 'env-1' })
    mockDeployAgentSpec.mockResolvedValue('assistant-1')

    await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Support Ops' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Support Agent',
            runtime: {
              mode: 'dedicated',
              engine: 'hermes',
              runtime_id: '11111111-1111-4111-8111-111111111111',
            },
            spec: {
              kind: 'agent',
              system_prompt: 'You run support.',
            },
          },
        ],
      },
      'org-1',
      'user-1',
      { projectId: 'project-1' },
    )

    expect(mockDeployAgentSpec).toHaveBeenCalledWith(
      expect.anything(),
      {},
      'org-1',
      'user-1',
      expect.objectContaining({
        runtimeId: '11111111-1111-4111-8111-111111111111',
        runtimeFlavor: 'c1_managed',
        engine: 'hermes',
      }),
    )
  })

  it('deploys a team template blueprint through the canonical template path', async () => {
    mockGetDeployableTemplateCatalogEntry.mockResolvedValue({
      id: 'template-1',
      slug: 'marketing-campaign',
      version: '1.0.0',
      spec: {
        kind: 'team',
        members: [],
        edges: [],
      },
    })
    mockDeployResolvedTemplate.mockResolvedValue({
      deployment_id: 'deployment-1',
      kind: 'team',
      crew_id: 'crew-1',
      assistant_ids: ['assistant-1', 'assistant-2'],
    })

    const result = await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Campaign' },
        items: [
          {
            kind: 'team',
            source: 'template',
            template_slug: 'marketing-campaign',
            name: 'Campaign Team',
          },
        ],
      },
      'org-1',
      'user-1',
    )

    expect(mockDeployResolvedTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'marketing-campaign',
        spec: { kind: 'team', members: [], edges: [] },
      }),
      'org-1',
      'user-1',
      {},
      expect.objectContaining({
        nameOverride: 'Campaign Team',
        scope: expect.objectContaining({ projectId: 'project-primary', envId: 'env-default' }),
      }),
    )
    expect(result.primary).toEqual({
      kind: 'team',
      crewId: 'crew-1',
      assistantIds: ['assistant-1', 'assistant-2'],
    })
    expect(result.projectSlug).toBe('ops')
  })

  it('propagates blueprint runtime and engine settings for template teams', async () => {
    mockGetDeployableTemplateCatalogEntry.mockResolvedValue({
      id: 'template-1',
      slug: 'marketing-campaign',
      version: '1.0.0',
      spec: {
        kind: 'team',
        members: [],
        edges: [],
      },
    })
    mockDeployResolvedTemplate.mockResolvedValue({
      deployment_id: 'deployment-1',
      kind: 'team',
      crew_id: 'crew-1',
      assistant_ids: ['assistant-1', 'assistant-2'],
    })

    await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Campaign' },
        items: [
          {
            kind: 'team',
            source: 'template',
            template_slug: 'marketing-campaign',
            name: 'Campaign Team',
            runtime: {
              mode: 'byo',
              engine: 'hermes',
              runtime_id: '22222222-2222-4222-8222-222222222222',
            },
          },
        ],
      },
      'org-1',
      'user-1',
    )

    expect(mockDeployResolvedTemplate).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      {},
      expect.objectContaining({
        runtimeId: '22222222-2222-4222-8222-222222222222',
        runtimeFlavor: 'c2a_autonomous',
        engine: 'hermes',
      }),
    )
  })

  it('passes selected app bindings through template teams', async () => {
    mockGetDeployableTemplateCatalogEntry.mockResolvedValue({
      id: 'template-1',
      slug: 'marketing-campaign',
      version: '1.0.0',
      spec: {
        kind: 'team',
        members: [],
        edges: [],
      },
    })
    mockDeployResolvedTemplate.mockResolvedValue({
      deployment_id: 'deployment-1',
      kind: 'team',
      crew_id: 'crew-1',
      assistant_ids: ['assistant-1', 'assistant-2'],
    })

    await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Campaign' },
        items: [
          {
            kind: 'team',
            source: 'template',
            template_slug: 'marketing-campaign',
            name: 'Campaign Team',
          },
        ],
      },
      'org-1',
      'user-1',
      {
        selectedConnectionIdsByProvider: {
          hubspot: 'connection-row-1',
        },
      },
    )

    expect(mockDeployResolvedTemplate).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      {},
      expect.objectContaining({
        selectedConnectionIdsByProvider: {
          hubspot: 'connection-row-1',
        },
      }),
    )
  })

  it('passes selected app bindings through blank teams', async () => {
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'support-ops' })
    mockGetDefaultEnvironmentForProject.mockResolvedValue({ id: 'env-1' })
    mockDeployTeamSpec.mockResolvedValue({
      crewId: 'crew-1',
      assistantIds: ['assistant-1', 'assistant-2'],
    })

    const result = await blueprintModule.deployProjectBlueprint(
      {
        version: '1.0',
        project: { name: 'Support Ops' },
        items: [
          {
            kind: 'team',
            source: 'blank',
            name: 'Support Team',
            spec: {
              kind: 'team',
              objective: 'Run support.',
              members: [
                { role: 'Coordinator', system_prompt: 'Coordinate support.', plugins: ['slack'] },
                { role: 'Researcher', system_prompt: 'Research support tickets.', plugins: ['google'] },
              ],
              edges: [{ from: 'Coordinator', to: 'Researcher' }],
            },
          },
        ],
      },
      'org-1',
      'user-1',
      {
        projectId: 'project-1',
        selectedConnectionIdsByProvider: {
          google: 'connection-google',
          slack: 'connection-slack',
        },
      },
    )

    expect(mockDeployTeamSpec).toHaveBeenCalledWith(
      expect.anything(),
      {},
      'org-1',
      'user-1',
      expect.objectContaining({
        selectedConnectionIdsByProvider: {
          google: 'connection-google',
          slack: 'connection-slack',
        },
      }),
    )
    expect(result.primary).toEqual({
      kind: 'team',
      crewId: 'crew-1',
      assistantIds: ['assistant-1', 'assistant-2'],
    })
  })
})
