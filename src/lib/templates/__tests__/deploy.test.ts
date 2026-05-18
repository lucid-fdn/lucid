import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

function createChain(resolveWith: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const fn of ['delete', 'update', 'eq', 'select', 'insert', 'upsert', 'single']) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => {
    resolve(resolveWith)
    return chain
  }
  return chain
}

const mockCreateAssistant = vi.fn()
const mockDeleteAssistant = vi.fn()
const mockGetWorkspace = vi.fn()
const mockEnsurePluginInstallation = vi.fn()
const mockActivatePlugin = vi.fn()
const mockEnsureSkillInstallation = vi.fn()
const mockEnsureSkillActivation = vi.fn()
const mockGetSkillBySlug = vi.fn()
const mockCreateCrew = vi.fn()
const mockGetTemplateById = vi.fn()
const mockGetTemplateBySlug = vi.fn()
const mockCaptureException = vi.fn()
const mockFrom = vi.fn()
const mockGetPrimaryProjectForWorkspace = vi.fn()
const mockGetDefaultEnvironmentForProject = vi.fn()
const mockEnsureAssistantAppBindingsForPlugins = vi.fn()

vi.mock('@/lib/db', () => ({
  activatePlugin: (...args: unknown[]) => mockActivatePlugin(...args),
  createAssistant: (...args: unknown[]) => mockCreateAssistant(...args),
  deleteAssistant: (...args: unknown[]) => mockDeleteAssistant(...args),
  ensurePluginInstallation: (...args: unknown[]) => mockEnsurePluginInstallation(...args),
  getWorkspace: (...args: unknown[]) => mockGetWorkspace(...args),
}))

vi.mock('@/lib/db/crews', () => ({
  createCrew: (...args: unknown[]) => mockCreateCrew(...args),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

vi.mock('@/lib/db/projects', () => ({
  getPrimaryProjectForWorkspace: (...args: unknown[]) => mockGetPrimaryProjectForWorkspace(...args),
  getDefaultEnvironmentForProject: (...args: unknown[]) => mockGetDefaultEnvironmentForProject(...args),
}))

vi.mock('@/lib/db/skills', () => ({
  ensureSkillActivation: (...args: unknown[]) => mockEnsureSkillActivation(...args),
  ensureSkillInstallation: (...args: unknown[]) => mockEnsureSkillInstallation(...args),
  getSkillBySlug: (...args: unknown[]) => mockGetSkillBySlug(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

vi.mock('@/lib/capabilities/agent-app-bindings', () => ({
  ensureAssistantAppBindingsForPlugins: (...args: unknown[]) => mockEnsureAssistantAppBindingsForPlugins(...args),
}))

const deployModule = await import('../deploy')
async function deployTemplateFixture(
  templateIdOrSlug: string,
  orgId: string,
  userId: string,
  params: Record<string, string> = {},
  nameOverride?: string,
  options: Parameters<typeof deployModule.deployResolvedTemplate>[4] = {},
) {
  const template = templateIdOrSlug.match(/^[0-9a-f-]{36}$/i)
    ? await mockGetTemplateById(templateIdOrSlug, orgId)
    : await mockGetTemplateBySlug(templateIdOrSlug, orgId)

  if (!template) {
    throw new Error(`Template not found: ${templateIdOrSlug}`)
  }

  return deployModule.deployResolvedTemplate(template, orgId, userId, params, {
    ...options,
    nameOverride,
  })
}

function buildAgentTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    slug: 'sales-assistant',
    name: 'Sales Assistant',
    description: null,
    category: 'sales',
    kind: 'agent',
    source: 'platform',
    status: 'approved',
    is_public: true,
    owner_org_id: null,
    spec: {
      kind: 'agent',
      system_prompt: 'Hello {{COMPANY_NAME}}',
      plugins: ['hubspot'],
      skills: ['crm-basics'],
      ...((overrides.spec as Record<string, unknown> | undefined) ?? {}),
    },
    params: [
      {
        key: 'COMPANY_NAME',
        label: 'Company',
        type: 'text',
        required: true,
        placeholder: 'Acme',
        hint: 'Used in the prompt',
      },
      ...((overrides.params as unknown[] | undefined) ?? []),
    ],
    preview_prompt: null,
    tags: [],
    install_count: 0,
    created_by: null,
    created_at: '2026-04-13T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
    ...overrides,
  }
}

describe('deployResolvedTemplate materializer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => createChain())
    mockGetWorkspace.mockResolvedValue({
      project: { id: 'project-1', slug: 'ops' },
      env: { id: 'env-1' },
    })
    mockDeleteAssistant.mockResolvedValue(undefined)
    mockGetPrimaryProjectForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'ops' })
    mockGetDefaultEnvironmentForProject.mockResolvedValue({ id: 'env-1' })
    mockEnsurePluginInstallation.mockResolvedValue('plugin-install-1')
    mockActivatePlugin.mockResolvedValue({ id: 'activation-1' })
    mockGetSkillBySlug.mockResolvedValue({ id: 'skill-1' })
    mockEnsureSkillInstallation.mockResolvedValue('skill-install-1')
    mockEnsureSkillActivation.mockResolvedValue('skill-activation-1')
    mockEnsureAssistantAppBindingsForPlugins.mockResolvedValue(undefined)
  })

  it('deploys an agent template successfully', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate())
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result).toEqual({
      deployment_id: expect.any(String),
      kind: 'agent',
      project_slug: 'ops',
      assistant_id: 'assistant-1',
    })
    expect(mockCreateAssistant).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      name: 'Acme Agent',
      systemPrompt: 'Hello Acme',
    }))
    expect(mockEnsurePluginInstallation).toHaveBeenCalledWith('org-1', 'hubspot', 'user-1')
    expect(mockEnsureAssistantAppBindingsForPlugins).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      pluginSlugs: ['hubspot'],
      selectedConnectionIdsByProvider: undefined,
    })
    expect(mockEnsureSkillInstallation).toHaveBeenCalledWith('org-1', 'skill-1', 'user-1')
  })

  it('passes selected app account bindings through template deploy', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate())
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })

    await deployTemplateFixture(
      'sales-assistant',
      'org-1',
      'user-1',
      { COMPANY_NAME: 'Acme' },
      undefined,
      { selectedConnectionIdsByProvider: { hubspot: 'connection-row-1' } },
    )

    expect(mockEnsureAssistantAppBindingsForPlugins).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      pluginSlugs: ['hubspot'],
      selectedConnectionIdsByProvider: { hubspot: 'connection-row-1' },
    })
  })

  it('applies template param defaults before rendering and recording the deployment', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      params: [{
        key: 'COMPANY_NAME',
        label: 'Company',
        type: 'text',
        required: true,
        placeholder: 'Acme',
        hint: 'Used in the prompt',
        default: 'Fallback Co',
      }],
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })

    await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {})

    expect(mockCreateAssistant).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Fallback Co Agent',
      systemPrompt: 'Hello Fallback Co',
    }))
  })

  it('rejects missing required params before creating resources', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate())

    await expect(
      deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {}),
    ).rejects.toThrow('Missing required template params: COMPANY_NAME')

    expect(mockCreateAssistant).not.toHaveBeenCalled()
  })

  it('keeps the assistant when optional template plugins are not available', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: ['hubspot', 'slack'],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })
    mockEnsurePluginInstallation
      .mockResolvedValueOnce('plugin-install-1')
      .mockResolvedValueOnce(null)
    mockActivatePlugin.mockResolvedValueOnce({ id: 'activation-1' })

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result).toEqual({
      deployment_id: expect.any(String),
      kind: 'agent',
      project_slug: 'ops',
      assistant_id: 'assistant-1',
    })
    expect(mockActivatePlugin).toHaveBeenCalledOnce()
    expect(mockDeleteAssistant).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('rolls back the assistant when plugin activation fails', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: ['hubspot'],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })
    mockActivatePlugin.mockResolvedValueOnce(null)

    await expect(
      deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
        COMPANY_NAME: 'Acme',
      }),
    ).rejects.toThrow('Template plugin setup failed')

    expect(mockDeleteAssistant).toHaveBeenCalledWith('assistant-1')
  })

  it('applies living spec hints after assistant creation (memory_schema + schedules)', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: [],
        skills: [],
        memory_schema: [
          { category: 'fact', description: 'Remember key facts', importance_floor: 0.6 },
        ],
        default_schedules: [
          { cron: '0 9 * * 1', prompt: 'Run weekly report', description: 'Weekly report', optional: false },
        ],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })

    // Simulate metadata read for channel hints
    mockFrom.mockImplementation((_table: string) => {
      const chain = createChain({ data: { metadata: {} }, error: null })
      return chain
    })

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result.kind).toBe('agent')
    expect(result.assistant_id).toBe('assistant-1')
    expect(result.project_slug).toBe('ops')
    // The assistant was created and living spec hints were applied (fail-open)
    expect(mockCreateAssistant).toHaveBeenCalledOnce()
    // memory_config update: mockFrom is called for agent_scheduled_tasks upsert + ai_assistants update
    expect(mockFrom).toHaveBeenCalled()
  })

  it('stores eval_pack hints as assistant metadata without failing deployment', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: [],
        skills: [],
        eval_pack: [
          {
            name: 'Greeting check',
            prompt: 'How do you help Acme?',
            expected_behaviors: ['mention Acme'],
          },
        ],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })
    mockFrom.mockImplementation(() => createChain({ data: { metadata: {} }, error: null }))

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result.assistant_id).toBe('assistant-1')
    expect(result.project_slug).toBe('ops')
    expect(mockFrom).toHaveBeenCalledWith('ai_assistants')
  })

  it('stores Agent Ops workflow bindings as template packaging metadata', async () => {
    const aiAssistantChains: Array<ReturnType<typeof createChain>> = []

    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: [],
        skills: [],
        channel_hints: [
          { channel_type: 'slack', required: false, setup_note: 'Optional Slack launch surface' },
        ],
        eval_pack: [
          {
            name: 'Incident triage check',
            prompt: 'Investigate a customer-impacting issue',
            expected_behaviors: ['cite evidence'],
          },
        ],
        ops_workflows: [
          {
            workflow_id: 'investigate',
            label: 'Investigate an incident',
            launch_contexts: ['project', 'incident'],
            input_defaults: { target: '{{COMPANY_NAME}} incident' },
          },
          {
            workflow_id: 'review',
            label: 'Review autonomous work',
            launch_contexts: ['run'],
          },
        ],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })
    mockFrom.mockImplementation((table: string) => {
      const chain = createChain({ data: { metadata: { existing_key: 'keep' } }, error: null })
      if (table === 'ai_assistants') {
        aiAssistantChains.push(chain)
      }
      return chain
    })

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result.assistant_id).toBe('assistant-1')

    const metadataPayloads = aiAssistantChains
      .map((chain) => chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined)
      .filter((payload) => payload?.metadata)

    expect(metadataPayloads).toContainEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        existing_key: 'keep',
        template_channel_hints: [
          { channel_type: 'slack', required: false, setup_note: 'Optional Slack launch surface' },
        ],
        template_eval_pack: [
          expect.objectContaining({ name: 'Incident triage check' }),
        ],
        template_ops_workflows: [
          expect.objectContaining({ workflow_id: 'investigate' }),
          expect.objectContaining({ workflow_id: 'review' }),
        ],
      }),
      updated_at: expect.any(String),
    }))
  })

  it('persists description, tool policy, and tool server metadata for agent templates', async () => {
    const aiAssistantChains: Array<ReturnType<typeof createChain>> = []

    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        description: 'Handles inbound support and escalation.',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: [],
        skills: [],
        tool_permission_policy: {
          type: 'always_allow',
          allowed_tools: ['clickup.create_task'],
        },
        tool_servers: [
          {
            name: 'clickup',
            protocol: 'mcp',
            transport: 'http',
            url: 'https://mcp.clickup.com/mcp',
            description: 'ClickUp MCP server',
          },
        ],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })
    mockFrom.mockImplementation((table: string) => {
      const chain = createChain({ data: { metadata: { existing_key: 'keep' } }, error: null })
      if (table === 'ai_assistants') {
        aiAssistantChains.push(chain)
      }
      return chain
    })

    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result.assistant_id).toBe('assistant-1')
    expect(result.project_slug).toBe('ops')

    const updatePayloads = aiAssistantChains
      .map((chain) => chain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined)
      .filter(Boolean)

    expect(updatePayloads).toContainEqual(expect.objectContaining({
      description: 'Handles inbound support and escalation.',
      policy_config: {
        type: 'always_allow',
        allowed_tools: ['clickup.create_task'],
      },
      updated_at: expect.any(String),
    }))

    expect(updatePayloads).toContainEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        existing_key: 'keep',
        template_tool_servers: [
          expect.objectContaining({
            name: 'clickup',
            url: 'https://mcp.clickup.com/mcp',
          }),
        ],
      }),
      updated_at: expect.any(String),
    }))
  })

  it('living spec hint failure is non-fatal and does not trigger rollback', async () => {
    mockGetTemplateBySlug.mockResolvedValue(buildAgentTemplate({
      spec: {
        kind: 'agent',
        system_prompt: 'Hello {{COMPANY_NAME}}',
        plugins: [],
        skills: [],
        default_schedules: [
          { cron: '0 9 * * 1', prompt: 'Run weekly report', description: 'Weekly', optional: false },
        ],
      },
    }))
    mockCreateAssistant.mockResolvedValue({ id: 'assistant-1' })

    // Simulate schedule upsert failure
    mockFrom.mockImplementation(() => {
      const chain = createChain({ data: null, error: { message: 'DB error' } })
      return chain
    })

    // Should NOT throw — living spec hints are fail-open
    const result = await deployTemplateFixture('sales-assistant', 'org-1', 'user-1', {
      COMPANY_NAME: 'Acme',
    })

    expect(result.kind).toBe('agent')
    expect(result.assistant_id).toBe('assistant-1')
    expect(result.project_slug).toBe('ops')
    // Rollback must NOT be triggered
    expect(mockDeleteAssistant).not.toHaveBeenCalled()
  })

  it('returns a team deployment result without legacy catalog recording', async () => {
    mockGetTemplateById.mockResolvedValue({
      id: 'template-team-1',
      slug: 'content-pipeline',
      name: 'Content Pipeline',
      description: null,
      category: 'content',
      kind: 'team',
      source: 'platform',
      status: 'approved',
      is_public: true,
      owner_org_id: null,
      spec: {
        kind: 'team',
        objective: 'Produce content for {{TOPIC}}',
        members: [
          {
            role: 'researcher',
            system_prompt: 'Research {{TOPIC}}',
          },
          {
            role: 'writer',
            system_prompt: 'Write about {{TOPIC}}',
          },
        ],
        edges: [{ from: 'researcher', to: 'writer' }],
      },
      params: [
        {
          key: 'TOPIC',
          label: 'Topic',
          type: 'text',
          required: true,
          placeholder: 'AI',
          hint: 'Primary topic',
        },
      ],
      preview_prompt: null,
      tags: [],
      install_count: 0,
      created_by: null,
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    })
    mockCreateAssistant
      .mockResolvedValueOnce({ id: 'assistant-1' })
      .mockResolvedValueOnce({ id: 'assistant-2' })
    mockCreateCrew.mockResolvedValue({
      crew: { id: 'crew-1' },
      members: [],
      edges: [],
    })
    const result = await deployTemplateFixture(
      '11111111-1111-1111-1111-111111111111',
      'org-1',
      'user-1',
      { TOPIC: 'AI' },
    )

    expect(result).toEqual({
      deployment_id: expect.any(String),
      kind: 'team',
      project_slug: 'ops',
      crew_id: 'crew-1',
      assistant_ids: ['assistant-1', 'assistant-2'],
    })
    expect(mockDeleteAssistant).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to record template deployment' }),
      expect.anything(),
    )
  })

  it('passes selected app account bindings to every team member plugin activation', async () => {
    mockCreateAssistant
      .mockResolvedValueOnce({ id: 'assistant-1' })
      .mockResolvedValueOnce({ id: 'assistant-2' })
    mockCreateCrew.mockResolvedValue({
      crew: { id: 'crew-1' },
      members: [],
      edges: [],
    })

    const result = await deployModule.deployTeamSpec(
      {
        kind: 'team',
        objective: 'Run a campaign.',
        members: [
          {
            role: 'Coordinator',
            is_coordinator: true,
            system_prompt: 'Coordinate the campaign.',
            plugins: ['hubspot'],
          },
          {
            role: 'Analyst',
            system_prompt: 'Analyze the campaign.',
            plugins: ['slack'],
          },
        ],
        edges: [{ from: 'Coordinator', to: 'Analyst' }],
      },
      {},
      'org-1',
      'user-1',
      {
        selectedConnectionIdsByProvider: {
          hubspot: 'connection-hubspot',
          slack: 'connection-slack',
        },
      },
    )

    expect(result).toEqual({
      crewId: 'crew-1',
      assistantIds: ['assistant-1', 'assistant-2'],
    })
    expect(mockEnsureAssistantAppBindingsForPlugins).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      pluginSlugs: ['hubspot'],
      selectedConnectionIdsByProvider: {
        hubspot: 'connection-hubspot',
        slack: 'connection-slack',
      },
    })
    expect(mockEnsureAssistantAppBindingsForPlugins).toHaveBeenCalledWith({
      assistantId: 'assistant-2',
      orgId: 'org-1',
      pluginSlugs: ['slack'],
      selectedConnectionIdsByProvider: {
        hubspot: 'connection-hubspot',
        slack: 'connection-slack',
      },
    })
  })
})
