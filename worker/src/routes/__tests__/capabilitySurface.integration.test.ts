import { beforeEach, describe, expect, it, vi } from 'vitest'

const { buildAgentToolRuntime, fetchMountedSkills } = vi.hoisted(() => ({
  buildAgentToolRuntime: vi.fn(),
  fetchMountedSkills: vi.fn(),
}))

vi.mock('../../agent/contracts/tool-runtime.js', () => ({
  buildAgentToolRuntime,
}))

vi.mock('../../agent/skills/fetch-active-skills.js', () => ({
  fetchMountedSkills,
}))

import { createCapabilitySurfaceInspectionHandler } from '../capabilitySurface.js'

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
}

function createSupabaseMock(assistant: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({ data: assistant, error: assistant ? null : { message: 'missing' } })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        plugin_slug: 'github',
        plugin_name: 'GitHub',
        tool_manifest: [
          { name: 'list_issues', description: 'List issues', parameters: {} },
          { name: 'close_issue', description: 'Close issue', parameters: {} },
        ],
        enabled_tools: null,
        org_config: {},
        plugin_config: {},
        kind: 'integration',
        transport: 'nango',
        trust_level: 'verified',
        execution_mode: 'gateway',
        auth_type: 'oauth2',
        auth_provider: 'github',
        connection_id: 'conn-1',
      },
      {
        plugin_slug: 'lucid-seo',
        plugin_name: 'Lucid SEO',
        tool_manifest: [
          { name: 'research_keywords', description: 'Research keywords', parameters: {} },
        ],
        enabled_tools: null,
        org_config: {},
        plugin_config: {},
        kind: 'plugin',
        transport: 'embedded',
        trust_level: 'internal',
        execution_mode: 'in_process',
        auth_type: 'none',
        auth_provider: null,
      },
    ],
    error: null,
  })

  return {
    from,
    rpc,
  }
}

describe('createCapabilitySurfaceInspectionHandler integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildAgentToolRuntime.mockResolvedValue({
      clientTools: [
        { type: 'function', function: { name: 'lucid-seo__research_keywords', description: 'Research keywords' } },
      ],
      awarenessPrompt: '## Tooling\nseo',
      executor: vi.fn(),
      allowlist: new Set(['lucid-seo__research_keywords']),
      openclawToolPolicy: { tools: { deny: [] } },
      toolMeta: new Map(),
      selection: {
        engine: 'openclaw',
        model: 'openai/gpt-4.1',
        provider: 'openai',
        originalCount: 3,
        selectedCount: 1,
        maxClientTools: 1,
        decisions: [
          { toolName: 'lucid-seo__research_keywords', included: true, reason: 'within_budget' },
          { toolName: 'github__list_issues', included: false, reason: 'provider_budget' },
          { toolName: 'github__close_issue', included: false, reason: 'provider_budget' },
        ],
      },
      getToolCallCount: () => 0,
    })
    fetchMountedSkills.mockResolvedValue({
      rows: [],
      promptSection: 'Mounted skill prompt',
      snapshot: { prompt: '', skills: [], resolvedSkills: [] },
      selectionSummary: {
        selectedCount: 1,
        decisions: [
          {
            skillSlug: 'market-intel',
            source: 'builtin',
            reason: 'builtin',
          },
        ],
      },
      exclusionSummary: {
        excludedCount: 0,
        decisions: [],
      },
    })
  })

  it('returns the real capability surface introspection built from selection logic', async () => {
    const handler = createCapabilitySurfaceInspectionHandler(
      createSupabaseMock({
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw',
        runtime_flavor: 'c2a_autonomous',
        system_prompt: 'Be concise',
        soul_content: null,
        lucid_model: 'openai/gpt-4.1',
        temperature: 0.2,
        max_tokens: 4096,
        memory_enabled: true,
        memory_window_size: 20,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        approval_required_tools: [],
        agent_wallets: [],
      }) as never,
      {} as never,
    )
    const res = createMockResponse()

    await handler({
      body: {
        assistantId: 'asst-1',
        userMessage: 'Use github to list issues and check lucid-seo',
      },
    } as never, res as never)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      effectiveConfig: {
        engine: 'openclaw',
        runtimeFlavor: 'c2a_autonomous',
        channelOwnership: 'lucid_relay',
        model: 'openai/gpt-4.1',
        provider: 'openai',
      },
      capabilitySurface: {
        engine: 'openclaw',
        runtimeFlavor: 'c2a_autonomous',
        channelOwnership: 'lucid_relay',
        model: 'openai/gpt-4.1',
        provider: 'openai',
        awarenessPromptChars: 'Mounted skill prompt\n\n## Tooling\nseo'.length,
        tools: {
          selectedCount: 1,
          eligibleCount: 3,
          hiddenCount: 2,
          maxClientTools: 1,
          selectedToolNames: ['lucid-seo__research_keywords'],
          hiddenToolNames: ['github__list_issues', 'github__close_issue'],
        },
        skills: {
          mountedCount: 1,
          excludedCount: 0,
          mounted: [
            {
              skillSlug: 'market-intel',
              source: 'builtin',
              reason: 'builtin',
            },
          ],
          excluded: [],
        },
        integrations: {
          eligibleCount: 2,
          activeCount: 1,
          hiddenCount: 1,
          entries: [
            {
              slug: 'github',
              kind: 'integration',
              transport: 'nango',
              trustLevel: 'verified',
              executionMode: 'gateway',
              relevance: 'explicit',
              executionFit: 'standard',
              priorityRank: 1,
              selectedToolCount: 0,
              hiddenToolCount: 2,
              selectedToolNames: [],
              hiddenToolNames: ['github__list_issues', 'github__close_issue'],
              status: 'hidden',
              reason: 'provider_budget',
            },
            {
              slug: 'lucid-seo',
              kind: 'plugin',
              transport: 'embedded',
              trustLevel: 'internal',
              executionMode: 'in_process',
              relevance: 'explicit',
              executionFit: 'preferred',
              priorityRank: 0,
              selectedToolCount: 1,
              hiddenToolCount: 0,
              selectedToolNames: ['lucid-seo__research_keywords'],
              hiddenToolNames: [],
              status: 'active',
              reason: 'mounted',
            },
          ],
        },
      },
    })
  })
})
