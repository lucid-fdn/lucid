import { describe, expect, it } from 'vitest'

import type { GenerationIntent, TemplateMatch } from '@/lib/ai/project-generation/schemas'

import { decideBuilderTopology, shouldUseTopologyLlm } from './topology-policy'

function intent(overrides: Partial<GenerationIntent> = {}): GenerationIntent {
  return {
    requested_domain: undefined,
    requested_outcome: 'Create a setup',
    likely_mode: 'blank-agent',
    required_integrations: [],
    runtime_preference: undefined,
    missing_required_info: [],
    confidence: 0.76,
    team_needed: false,
    reuse_template_likely: false,
    ...overrides,
  }
}

describe('builder topology policy', () => {
  it.each([
    'create daily assistant',
    'create one assistant for email calendar and tasks',
    'one agent to manage my inbox and reminders',
    'personal assistant with Gmail Slack and Notion',
    'create daily assistnat for a small team',
    'build personal operator for inbox calendar and tasks for a small team',
    'create support agent for billing questions and escalations for a small team',
    'create brand monitor that tracks mentions and sentiment for a small team',
    'build competitive intelligence monitor for market research for a small team',
  ])('defaults obvious assistant prompts to single-agent: %s', (prompt) => {
    const decision = decideBuilderTopology({
      prompt,
      intent: intent({ requested_outcome: prompt }),
    })

    expect(decision.topology).toBe('single-agent')
    expect(decision.confidence).toBeGreaterThanOrEqual(0.74)
  })

  it.each([
    'create a content team with research writing editing and publishing',
    'build a multi-agent research crew with a coordinator and reviewer',
    'create agents with coordinator, specialist, and approval handoff',
    'make a team that researches, writes, reviews, then publishes articles',
  ])('detects explicit or structural team prompts: %s', (prompt) => {
    const decision = decideBuilderTopology({
      prompt,
      intent: intent({
        requested_outcome: prompt,
        likely_mode: 'blank-team',
        team_needed: true,
      }),
    })

    expect(decision.topology).toBe('team')
    expect(decision.suggested_roles.length).toBeGreaterThanOrEqual(2)
  })

  it('asks a topology clarification for broad low-specificity growth requests', () => {
    const decision = decideBuilderTopology({
      prompt: 'build something to run growth',
      intent: intent({
        requested_outcome: 'build something to run growth',
        likely_mode: 'blank-team',
        confidence: 0.48,
        team_needed: true,
      }),
    })

    expect(decision.topology).toBe('clarify')
    expect(decision.clarification?.options.map((option) => option.id)).toEqual(['single-agent', 'team'])
  })

  it.each([
    'make an agent or team for operations',
    'I need help automating everything around go to market',
    'create something for marketing sales and support',
    'I want automation for the whole company',
  ])('asks before choosing topology for broad multi-domain prompts: %s', (prompt) => {
    const decision = decideBuilderTopology({
      prompt,
      intent: intent({
        requested_outcome: prompt,
        likely_mode: 'blank-team',
        confidence: 0.56,
        team_needed: true,
      }),
    })

    expect(decision.topology).toBe('clarify')
    expect(decision.clarification?.ambiguity_class).toBe('topology')
  })

  it('uses selected template kind as the topology source of truth', () => {
    const teamDecision = decideBuilderTopology({
      prompt: 'use Authority Engine template',
      selectedTemplate: {
        slug: 'authority-engine',
        name: 'Authority Engine',
        kind: 'team',
      },
      intent: intent({ likely_mode: 'template', reuse_template_likely: true }),
    })
    const agentDecision = decideBuilderTopology({
      prompt: 'use Daily Assistant template',
      selectedTemplate: {
        slug: 'daily-assistant',
        name: 'Daily Assistant',
        kind: 'agent',
      },
      intent: intent({ likely_mode: 'template', reuse_template_likely: true }),
    })

    expect(teamDecision).toMatchObject({ topology: 'team', source: 'template' })
    expect(agentDecision).toMatchObject({ topology: 'single-agent', source: 'template' })
  })

  it('lets explicit preferred mode override prompt ambiguity', () => {
    expect(decideBuilderTopology({
      prompt: 'build something to run growth',
      preferredMode: 'agent',
      intent: intent({ likely_mode: 'blank-team' }),
    })).toMatchObject({ topology: 'single-agent', source: 'explicit-user' })

    expect(decideBuilderTopology({
      prompt: 'daily assistant',
      preferredMode: 'team',
      intent: intent({ likely_mode: 'blank-agent' }),
    })).toMatchObject({ topology: 'team', source: 'explicit-user' })
  })

  it('uses strong LLM intent only after deterministic signals are weak', () => {
    const decision = decideBuilderTopology({
      prompt: 'set up a customer intelligence workflow',
      intent: intent({ confidence: 0.58 }),
      llmIntent: {
        recommended_topology: 'team',
        confidence: 0.83,
        rationale: 'The work has collection, analysis, and review units.',
        work_units: ['collect', 'analyze', 'review'],
        handoffs: ['analyst to reviewer'],
        suggested_roles: [
          {
            id: 'coordinator',
            label: 'Coordinator',
            mission: 'Own final output.',
            responsibilities: ['Route work'],
            required_capabilities: [],
          },
          {
            id: 'analyst',
            label: 'Analyst',
            mission: 'Analyze source material.',
            responsibilities: ['Analyze input'],
            required_capabilities: [],
          },
        ],
      },
    })

    expect(decision).toMatchObject({ topology: 'team', source: 'llm' })
    expect(decision.suggested_roles.map((role) => role.label)).toContain('Analyst')
  })

  it('does not call topology LLM for explicit or template cases', () => {
    const explicit = decideBuilderTopology({
      prompt: 'create a team of agents',
      intent: intent({ likely_mode: 'blank-team', team_needed: true }),
    })
    expect(shouldUseTopologyLlm({
      prompt: 'create a team of agents',
      firstPass: explicit,
    })).toBe(false)

    const template = decideBuilderTopology({
      prompt: 'use Authority Engine template',
      selectedTemplate: { slug: 'authority-engine', name: 'Authority Engine', kind: 'team' },
      intent: intent({ likely_mode: 'template' }),
    })
    expect(shouldUseTopologyLlm({
      prompt: 'use Authority Engine template',
      selectedTemplate: { slug: 'authority-engine', name: 'Authority Engine', kind: 'team' },
      firstPass: template,
    })).toBe(false)
  })

  it('can use a high-confidence team template match without explicit template selection', () => {
    const matches: TemplateMatch[] = [
      {
        slug: 'content-machine',
        name: 'Content Machine',
        kind: 'team',
        score: 0.86,
        reason: 'Strong team template match',
        missing_params: [],
      },
    ]

    const decision = decideBuilderTopology({
      prompt: 'turn one keyword into a complete article package',
      templateMatches: matches,
      intent: intent({ likely_mode: 'blank-agent', confidence: 0.72 }),
    })

    expect(decision.topology).toBe('team')
    expect(decision.source).toBe('policy')
  })
})
