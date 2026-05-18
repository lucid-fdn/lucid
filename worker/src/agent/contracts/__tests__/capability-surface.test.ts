import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildAgentToolRuntime = vi.fn()
const fetchMountedSkills = vi.fn()

vi.mock('../tool-runtime.js', () => ({
  buildAgentToolRuntime,
}))

vi.mock('../../skills/fetch-active-skills.js', () => ({
  fetchMountedSkills,
}))

describe('buildAgentCapabilitySurface', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    buildAgentToolRuntime.mockResolvedValue({
      clientTools: [
        { type: 'function', function: { name: 'wallet_balance', description: 'Balance' } },
      ],
      awarenessPrompt: '## Tooling\nwallet',
      executor: vi.fn(),
      allowlist: new Set(['wallet_balance']),
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
          { toolName: 'wallet_balance', included: true, reason: 'within_budget' },
          { toolName: 'github__list_issues', included: false, reason: 'provider_budget' },
          { toolName: 'slack__post_message', included: false, reason: 'provider_budget' },
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
        excludedCount: 1,
        decisions: [
          {
            skillSlug: 'legacy-skill',
            reason: 'legacy_openclaw_only',
            sourceType: 'internal',
            sourceVersion: '1.0.0',
          },
        ],
      },
    })
  })

  it('builds a unified introspection summary for tools and skills', async () => {
    const { buildAgentCapabilitySurface } = await import('../capability-surface.js')

    const surface = await buildAgentCapabilitySurface({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw',
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
        trading_enabled: false,
      },
      plugins: [],
      supabase: {} as never,
      runId: 'run-1',
      conversationId: 'conv-1',
      userMessage: 'What can you do?',
      subagentDepth: 0,
      sessionFile: '/tmp/session.json',
      workspaceDir: '/tmp/workspace',
    })

    expect(surface.awarenessPrompt).toContain('Mounted skill prompt')
    expect(surface.awarenessPrompt).toContain('## Tooling')
    expect(surface.introspection).toEqual({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
      model: 'openai/gpt-4.1',
      provider: 'openai',
      awarenessPromptChars: surface.awarenessPrompt.length,
      tools: {
        selectedCount: 1,
        eligibleCount: 3,
        hiddenCount: 2,
        maxClientTools: 1,
        selectedToolNames: ['wallet_balance'],
        hiddenToolNames: ['github__list_issues', 'slack__post_message'],
      },
      skills: {
        mountedCount: 1,
        excludedCount: 1,
        mounted: [
          {
            skillSlug: 'market-intel',
            source: 'builtin',
            reason: 'builtin',
          },
        ],
        excluded: [
          {
            skillSlug: 'legacy-skill',
            reason: 'legacy_openclaw_only',
            sourceType: 'internal',
            sourceVersion: '1.0.0',
          },
        ],
      },
      integrations: {
        eligibleCount: 0,
        activeCount: 0,
        hiddenCount: 0,
        entries: [],
      },
    })
  })

  it('summarizes integration/plugin capability status from the selected surface', async () => {
    const { buildAgentCapabilitySurface } = await import('../capability-surface.js')

    const surface = await buildAgentCapabilitySurface({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw',
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
        trading_enabled: false,
      },
      plugins: [
        {
          slug: 'github',
          name: 'GitHub',
          tools: [
            { name: 'list_issues', description: 'List issues', parameters: {} },
            { name: 'close_issue', description: 'Close issue', parameters: {} },
          ],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-1',
        },
        {
          slug: 'notion',
          name: 'Notion',
          tools: [
            { name: 'search', description: 'Search notion', parameters: {} },
          ],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'notion',
        },
      ],
      supabase: {} as never,
      runId: 'run-1',
      conversationId: 'conv-1',
      userMessage: 'Use github to list issues for me',
      subagentDepth: 0,
      sessionFile: '/tmp/session.json',
      workspaceDir: '/tmp/workspace',
    })

    expect(surface.introspection.integrations).toEqual({
      eligibleCount: 2,
      activeCount: 0,
      hiddenCount: 2,
      entries: [
        {
          slug: 'github',
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          relevance: 'explicit',
          executionFit: 'standard',
          priorityRank: 0,
          selectedToolCount: 0,
          hiddenToolCount: 1,
          selectedToolNames: [],
          hiddenToolNames: ['github__list_issues'],
          status: 'hidden',
          reason: 'provider_budget',
        },
        {
          slug: 'notion',
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          relevance: 'background',
          executionFit: 'standard',
          priorityRank: undefined,
          selectedToolCount: 0,
          hiddenToolCount: 0,
          selectedToolNames: [],
          hiddenToolNames: [],
          status: 'skipped',
          reason: 'missing_connection',
        },
      ],
    })
  })

  it('reports trivial-turn-hidden integrations explicitly', async () => {
    const { buildAgentCapabilitySurface } = await import('../capability-surface.js')

    const surface = await buildAgentCapabilitySurface({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw',
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
        trading_enabled: false,
      },
      plugins: [
        {
          slug: 'github',
          name: 'GitHub',
          tools: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-1',
        },
      ],
      supabase: {} as never,
      runId: 'run-1',
      conversationId: 'conv-1',
      userMessage: 'hi',
      subagentDepth: 0,
      sessionFile: '/tmp/session.json',
      workspaceDir: '/tmp/workspace',
    })

    expect(surface.introspection.integrations).toEqual({
      eligibleCount: 1,
      activeCount: 0,
      hiddenCount: 1,
      entries: [
        {
          slug: 'github',
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          relevance: 'background',
          executionFit: 'standard',
          priorityRank: undefined,
          selectedToolCount: 0,
          hiddenToolCount: 1,
          selectedToolNames: [],
          hiddenToolNames: ['github__list_issues'],
          status: 'hidden',
          reason: 'trivial_turn',
        },
      ],
    })
  })
})
