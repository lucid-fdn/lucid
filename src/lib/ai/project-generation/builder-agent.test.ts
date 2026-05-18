import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const runInternalTextAgent = vi.fn()
const getBuilderCapabilityRegistry = vi.fn()
const summarizeRelevantBuilderCapabilityRegistry = vi.fn()
const planBuilderTeamTopology = vi.fn()
const recommendRuntimeMode = vi.fn()

vi.mock('@/lib/ai/services/internal-agent-service', () => ({
  runInternalTextAgent,
}))

vi.mock('./capability-registry', () => ({
  getBuilderCapabilityRegistry,
  summarizeRelevantBuilderCapabilityRegistry,
}))

vi.mock('./team-planner', () => ({
  planBuilderTeamTopology,
  recommendRuntimeMode,
}))

describe('runBuilderPlanningAgent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getBuilderCapabilityRegistry.mockResolvedValue({
      skills: [],
      plugins: [],
      internalTools: [],
      toolServers: [],
      templates: [],
    })
    summarizeRelevantBuilderCapabilityRegistry.mockReturnValue('capability summary')
    planBuilderTeamTopology.mockReturnValue({
      mode: 'blank-agent',
      rationale: 'single agent is enough',
      members: [],
      edges: [],
    })
    recommendRuntimeMode.mockReturnValue('shared')
  })

  it('uses the generic internal agent service when worker-agent planning is selected', async () => {
    const { runBuilderPlanningAgent } = await import('./builder-agent')

    runInternalTextAgent.mockResolvedValue({
      text: 'worker planning memo',
      modelId: 'openai/gpt-4.1',
      backend: 'worker-agent',
    })

    const result = await runBuilderPlanningAgent({
      prompt: 'create a support agent',
      orgId: 'org-1',
      model: { provider: 'mock-model' } as any,
      modelId: 'openai/gpt-4.1',
      templates: [],
      intent: {
        requested_outcome: 'create a support agent',
        likely_mode: 'blank-agent',
        required_integrations: [],
        missing_required_info: [],
        confidence: 0.8,
        team_needed: false,
        reuse_template_likely: false,
      },
      templateMatches: [],
      planningBackend: 'worker-agent',
    })

    expect(runInternalTextAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'builder-planner',
        orgId: 'org-1',
      }),
    )
    expect(result.planningMemo).toBe('worker planning memo')
  }, 15_000)
})
