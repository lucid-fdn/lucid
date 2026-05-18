import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const generateStructuredObject = vi.fn()
const runBuilderPlanningAgent = vi.fn()

vi.mock('@/lib/ai/generation', () => ({
  generateStructuredObject,
}))

vi.mock('./builder-agent', () => ({
  runBuilderPlanningAgent,
}))

function planningResult() {
  return {
    capabilityRegistry: {
      skills: [],
      plugins: [],
      internalTools: [],
      toolServers: [],
      templates: [],
    },
    capabilitySnapshot: 'No capabilities',
    teamPlan: {
      mode: 'blank-agent',
      rationale: 'Single agent is enough.',
      members: [],
      edges: [],
      runtimeMode: 'shared',
    },
    runtimeRecommendation: 'shared',
    planningMemo: 'Use the simplest viable setup.',
  }
}

function aiAgentDraft(prompt: string, mode: 'blank-agent' | 'blank-team' = 'blank-agent') {
  return {
    version: '1.0',
    sourcePrompt: prompt,
    mode,
    project: {
      name: mode === 'blank-team' ? 'Content Team' : 'Personal Assistant',
      description: mode === 'blank-team' ? 'A coordinated content workflow.' : 'A daily assistant.',
      category: 'productivity',
    },
    starterName: mode === 'blank-team' ? 'Content Team' : 'Personal Assistant',
    runtime: {
      mode: 'shared',
      engine: '',
      provider: '',
    },
    template: {
      slug: '',
      name: '',
      kind: 'agent',
      params: [],
    },
    agent: {
      kind: 'agent',
      description: 'A single operator.',
      system_prompt: 'Help the user with the requested work.',
      soul_content: '',
      model_hint: '',
      plugins: [],
      skills: [],
      tool_servers: [],
      tool_permission_policy: null,
      memory_enabled: true,
      memory_strategy: 'auto',
      approval_required_tools: [],
      cost_limit_per_run_usd: null,
      cost_limit_daily_usd: null,
      memory_schema: [],
      default_schedules: [],
      channel_hints: [],
      eval_pack: [],
    },
    team: {
      kind: 'team',
      objective: 'Coordinate the requested workflow.',
      members: [
        {
          role: 'Coordinator',
          is_coordinator: true,
          description: 'Owns the final output.',
          responsibilities: ['Route work'],
          system_prompt: 'Coordinate the work.',
          soul_content: '',
          model_hint: '',
          plugins: [],
          skills: [],
          tool_servers: [],
          tool_permission_policy: null,
          memory_schema: [],
          default_schedules: [],
        },
        {
          role: 'Specialist',
          is_coordinator: false,
          description: 'Handles specialist execution.',
          responsibilities: ['Execute assigned work'],
          system_prompt: 'Execute the assigned work.',
          soul_content: '',
          model_hint: '',
          plugins: [],
          skills: [],
          tool_servers: [],
          tool_permission_policy: null,
          memory_schema: [],
          default_schedules: [],
        },
      ],
      edges: [
        {
          from: 'Coordinator',
          to: 'Specialist',
          label: 'delegates',
        },
      ],
      channel_hints: [],
      eval_pack: [],
    },
  }
}

describe('generateProjectBlueprint topology integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runBuilderPlanningAgent.mockResolvedValue(planningResult())
    generateStructuredObject.mockResolvedValue({
      object: {
        draft: aiAgentDraft('fallback'),
        reasoning_summary: 'Generated a setup.',
        confidence: 0.8,
      },
    })
  })

  it('records single-agent topology for obvious assistant prompts without asking', async () => {
    const { generateProjectBlueprint } = await import('./generate-blueprint')

    const result = await generateProjectBlueprint({
      prompt: 'daily assistant',
      templates: [],
      strongModel: 'mock-strong',
      fastModel: 'mock-fast',
      availableUnifiedSkills: [],
    })

    expect(result.mode).toBe('blank-agent')
    expect(result.topology_decision).toMatchObject({
      topology: 'single-agent',
      source: 'explicit-user',
    })
    expect(result.clarification).toBeUndefined()
  })

  it('enforces team topology even when draft generation returns a single agent', async () => {
    const { generateProjectBlueprint } = await import('./generate-blueprint')

    generateStructuredObject
      .mockResolvedValueOnce({
        object: {
          requested_domain: 'content',
          requested_outcome: 'create a content team with research writing editing and publishing',
          likely_mode: 'blank-team',
          required_integrations: [],
          runtime_preference: 'shared',
          missing_required_info: [],
          confidence: 0.84,
          team_needed: true,
          reuse_template_likely: false,
        },
      })
      .mockResolvedValueOnce({
        object: {
          draft: aiAgentDraft('create a content team with research writing editing and publishing', 'blank-agent'),
          reasoning_summary: 'Generated as one agent.',
          confidence: 0.78,
        },
      })

    const result = await generateProjectBlueprint({
      prompt: 'create a content team with research writing editing and publishing',
      templates: [],
      strongModel: 'mock-strong',
      fastModel: 'mock-fast',
      availableUnifiedSkills: [],
    })

    expect(result.topology_decision).toMatchObject({
      topology: 'team',
      source: 'explicit-user',
    })
    expect(result.mode).toBe('blank-team')
    expect(result.draft.team?.members.length).toBeGreaterThanOrEqual(2)
  })

  it('returns a topology clarification for broad ambiguous setup prompts', async () => {
    const { generateProjectBlueprint } = await import('./generate-blueprint')

    generateStructuredObject
      .mockResolvedValueOnce({
        object: {
          recommended_topology: 'clarify',
          confidence: 0.72,
          rationale: 'Growth could be one operator or a team.',
          work_units: [],
          handoffs: [],
          suggested_roles: [],
          ambiguity_reason: 'The request does not say whether separate roles are desired.',
        },
      })
      .mockResolvedValueOnce({
        object: {
          draft: aiAgentDraft('build something to run growth', 'blank-team'),
          reasoning_summary: 'Generated a conservative setup.',
          confidence: 0.62,
        },
      })

    const result = await generateProjectBlueprint({
      prompt: 'build something to run growth',
      templates: [],
      strongModel: 'mock-strong',
      fastModel: 'mock-fast',
      availableUnifiedSkills: [],
    })

    expect(result.topology_decision?.topology).toBe('clarify')
    expect(result.clarification).toMatchObject({
      needed: true,
      ambiguity_class: 'topology',
    })
    expect(result.clarification?.options.map((option) => option.id)).toEqual(['single-agent', 'team'])
    expect(result.mode).toBe('blank-agent')
  })
})
