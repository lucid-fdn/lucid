import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildAgentToolRuntime = vi.fn()
const fetchMountedSkills = vi.fn()

vi.mock('../tool-runtime.js', () => ({
  buildAgentToolRuntime,
}))

vi.mock('../../skills/fetch-active-skills.js', () => ({
  fetchMountedSkills,
}))

describe('buildAgentCapabilitySurface conformance', () => {
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
        originalCount: 2,
        selectedCount: 1,
        maxClientTools: 1,
        decisions: [
          { toolName: 'wallet_balance', included: true, reason: 'within_budget' },
          { toolName: 'github__list_issues', included: false, reason: 'provider_budget' },
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
          { skillSlug: 'market-intel', source: 'builtin', reason: 'builtin' },
        ],
      },
      exclusionSummary: {
        excludedCount: 0,
        decisions: [],
      },
    })
  })

  it('keeps the capability surface stable across engines for the same run inputs', async () => {
    const { buildAgentCapabilitySurface } = await import('../capability-surface.js')
    const commonInput = {
      runtimeFlavor: 'shared' as const,
      channelOwnership: 'lucid_relay' as const,
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw' as const,
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
          kind: 'integration' as const,
          transport: 'nango' as const,
          trustLevel: 'verified' as const,
          executionMode: 'gateway' as const,
          authType: 'oauth2' as const,
          authProvider: 'github',
          connectionId: 'conn-1',
        },
      ],
      supabase: {} as never,
      userId: 'user-1',
      runId: 'run-1',
      conversationId: 'conv-1',
      userMessage: 'Use github to list issues',
      subagentDepth: 0,
      sessionFile: '/tmp/session.json',
      workspaceDir: '/tmp/workspace',
      selection: {
        model: 'openai/gpt-4.1',
        provider: 'openai' as const,
      },
    }

    const openclawSurface = await buildAgentCapabilitySurface({
      ...commonInput,
      engine: 'openclaw',
    })
    const hermesSurface = await buildAgentCapabilitySurface({
      ...commonInput,
      engine: 'hermes',
    })

    expect(openclawSurface.awarenessPrompt).toBe(hermesSurface.awarenessPrompt)
    expect(openclawSurface.introspection.tools).toEqual(hermesSurface.introspection.tools)
    expect(openclawSurface.introspection.integrations).toEqual(hermesSurface.introspection.integrations)
    expect(openclawSurface.introspection.skills.mounted).toEqual(hermesSurface.introspection.skills.mounted)
    expect(openclawSurface.introspection.skills.excluded).toEqual(hermesSurface.introspection.skills.excluded)
  })
})
