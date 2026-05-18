import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { applyGenerationPatch, buildDraftFromTemplate, projectBlueprintFromDraft } from './draft'
import { refineGeneratedDraft } from './generate-blueprint'
import { validateAndRepairDraft } from './validate'
import { normalizeGenerationDraft } from './schemas'
import type { GenerationDraft } from './schemas'

const supportTemplate = {
  id: 'template-1',
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Handles support requests.',
  category: 'support',
  kind: 'agent' as const,
  source: 'platform' as const,
  status: 'approved' as const,
  is_public: true,
  owner_org_id: null,
  spec: {
    kind: 'agent' as const,
    system_prompt: 'You run support.',
  },
  params: [
    { key: 'company_name', label: 'Company name', type: 'text' as const, required: true },
  ],
  preview_prompt: 'Support operator for product questions.',
  tags: ['support', 'faq'],
  install_count: 14,
  created_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: '1.0.0',
  changelog: null,
  forked_from_id: null,
  forked_from_ver: null,
  component_type: null,
  cert_status: 'uncertified' as const,
  cert_score: null,
  cert_checked_at: null,
  outcome_data: {},
}

describe('project generation draft helpers', () => {
  it('builds a template-backed blueprint from draft state', () => {
    const draft = buildDraftFromTemplate(supportTemplate, {
      prompt: 'Build support for Acme.',
      params: { company_name: 'Acme' },
    })

    expect(projectBlueprintFromDraft(draft)).toEqual({
      version: '1.0',
      project: {
        name: 'Support Agent',
        description: 'Handles support requests.',
        category: 'support',
      },
      items: [
        {
          kind: 'agent',
          source: 'template',
          template_slug: 'support-agent',
          name: 'Support Agent',
          params: { company_name: 'Acme' },
        },
      ],
    })
  })

  it('applies patch updates without regenerating the full draft', () => {
    const initial: GenerationDraft = {
      version: '1.0',
      mode: 'blank-agent',
      project: { name: 'Ops' },
      starterName: 'Ops Agent',
      agent: {
        kind: 'agent',
        system_prompt: 'Run ops.',
      },
    }

    const next = applyGenerationPatch(initial, {
      summary: 'Convert this into a two-role team.',
      operations: [
        {
          op: 'convert_agent_to_team',
          objective: 'Run operations',
          members: [
            {
              role: 'Coordinator',
              is_coordinator: true,
              system_prompt: 'Coordinate work.',
            },
            {
              role: 'Analyst',
              system_prompt: 'Analyze incoming issues.',
            },
          ],
          edges: [{ from: 'Coordinator', to: 'Analyst' }],
        },
      ],
    })

    expect(next.mode).toBe('blank-team')
    expect(next.team?.members).toHaveLength(2)
    expect(next.agent).toBeUndefined()
  })

  it('preserves rich capability fields across agent and team patch updates', () => {
    const initial: GenerationDraft = {
      version: '1.0',
      mode: 'blank-agent',
      project: { name: 'Exec Ops' },
      agent: {
        kind: 'agent',
        system_prompt: 'Run executive operations.',
      },
    }

    const withAgentCapabilities = applyGenerationPatch(initial, {
      summary: 'Add MCP-backed capabilities and guardrails.',
      operations: [
        {
          op: 'update_agent_spec',
          spec: {
            kind: 'agent',
            description: 'Executive operating partner for the CEO.',
            system_prompt: 'Run executive operations with concise structured output.',
            model_hint: 'gpt-4.1-mini',
            skills: ['daily-briefing'],
            tool_servers: [
              {
                name: 'notion-mcp',
                protocol: 'mcp',
                transport: 'http',
                url: 'https://mcp.example.com/notion',
              },
            ],
            tool_permission_policy: {
              type: 'approval_required',
              allowed_tools: ['notion.read'],
            },
            approval_required_tools: ['calendar.write'],
          },
        },
      ],
    })

    expect(withAgentCapabilities.agent?.tool_servers?.[0]?.name).toBe('notion-mcp')
    expect(withAgentCapabilities.agent?.tool_permission_policy?.type).toBe('approval_required')

    const withTeamCapabilities = applyGenerationPatch(withAgentCapabilities, {
      summary: 'Turn this into a coordinated CEO office team.',
      operations: [
        {
          op: 'replace_team_spec',
          spec: {
            kind: 'team',
            objective: 'Run the CEO office',
            members: [
              {
                role: 'Chief of Staff',
                is_coordinator: true,
                responsibilities: ['Prioritize the queue', 'Own the final brief'],
                system_prompt: 'Coordinate executive office work.',
              },
              {
                role: 'Research Analyst',
                responsibilities: ['Research topics', 'Draft findings'],
                system_prompt: 'Research and draft concise findings.',
                tool_servers: [
                  {
                    name: 'search-mcp',
                    protocol: 'mcp',
                    transport: 'sse',
                    url: 'https://mcp.example.com/search/sse',
                  },
                ],
              },
            ],
            edges: [{ from: 'Chief of Staff', to: 'Research Analyst' }],
          },
        },
      ],
    })

    expect(withTeamCapabilities.mode).toBe('blank-team')
    expect(withTeamCapabilities.team?.members[0]?.responsibilities).toContain('Prioritize the queue')
    expect(withTeamCapabilities.team?.members[1]?.tool_servers?.[0]?.name).toBe('search-mcp')
  })

  it('repairs coordinator conflicts and reports missing template params', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Support Team' },
      team: {
        kind: 'team',
        objective: 'Support',
        members: [
          { role: 'Lead', is_coordinator: true, system_prompt: 'Lead.' },
          { role: 'Specialist', is_coordinator: true, system_prompt: 'Specialist.' },
        ],
        edges: [{ from: 'Lead', to: 'Specialist' }],
      },
    }

    const validatedTeam = validateAndRepairDraft(draft, new Map())
    expect(validatedTeam.draft.team?.members.filter((member) => member.is_coordinator)).toHaveLength(1)

    const templateDraft = buildDraftFromTemplate(supportTemplate)
    const validatedTemplate = validateAndRepairDraft(
      templateDraft,
      new Map([[supportTemplate.slug, supportTemplate]]),
    )
    expect(validatedTemplate.missingRequiredInputs).toEqual([
      {
        key: 'company_name',
        label: 'Company name',
        reason: 'Support Agent requires this value before deploy',
      },
    ])
  })

  it('normalizes empty template names and obvious assistant typos in generated drafts', () => {
    const normalized = normalizeGenerationDraft({
      version: '1.0',
      sourcePrompt: 'daily assistante',
      mode: 'template',
      project: {
        name: 'Daily Assistante',
        description: '',
        category: '',
      },
      starterName: 'Daily Assistante',
      runtime: {
        mode: 'shared',
        engine: '',
        provider: '',
      },
      template: {
        slug: 'personal-agent',
        name: '',
        kind: 'agent',
        params: [],
      },
      agent: {
        kind: 'agent',
        description: '',
        system_prompt: 'Help daily.',
        soul_content: '',
        model_hint: '',
        plugins: [],
        skills: [],
        tool_servers: [],
        tool_permission_policy: null,
        memory_enabled: false,
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
        objective: '',
        members: [],
        edges: [],
        channel_hints: [],
        eval_pack: [],
      },
    })

    expect(normalized.project.name).toBe('Daily Assistant')
    expect(normalized.starterName).toBe('Daily Assistant')
    expect(normalized.template?.name).toBe('Personal Agent')
  })

  it('normalizes common assistant typos in names', () => {
    const normalized = normalizeGenerationDraft({
      version: '1.0',
      sourcePrompt: 'daily assistnat',
      mode: 'blank-agent',
      project: {
        name: 'Daily Assistnat',
        description: '',
        category: '',
      },
      starterName: 'Daily Assistnat',
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
        description: '',
        system_prompt: 'Help daily.',
        soul_content: '',
        model_hint: '',
        plugins: [],
        skills: [],
        tool_servers: [],
        tool_permission_policy: null,
        memory_enabled: false,
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
        objective: '',
        members: [],
        edges: [],
        channel_hints: [],
        eval_pack: [],
      },
    })

    expect(normalized.project.name).toBe('Daily Assistant')
    expect(normalized.starterName).toBe('Daily Assistant')
  })

  it('strips leading builder verbs from generated project names', () => {
    const normalized = normalizeGenerationDraft({
      version: '1.0',
      sourcePrompt: 'start daily assistant',
      mode: 'blank-agent',
      project: {
        name: 'Start Daily Assistant',
        description: '',
        category: '',
      },
      starterName: 'Start Daily Assistant',
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
        description: '',
        system_prompt: 'Help daily.',
        soul_content: '',
        model_hint: '',
        plugins: [],
        skills: [],
        tool_servers: [],
        tool_permission_policy: null,
        memory_enabled: false,
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
        objective: '',
        members: [],
        edges: [],
        channel_hints: [],
        eval_pack: [],
      },
    })

    expect(normalized.project.name).toBe('Daily Assistant')
    expect(normalized.starterName).toBe('Daily Assistant')
  })

  it('strips multiple common builder verbs from generated names', () => {
    for (const source of ['create my personal agent', 'build daily assistant', 'launch support bot']) {
      const normalized = normalizeGenerationDraft({
        version: '1.0',
        sourcePrompt: source,
        mode: 'blank-agent',
        project: {
          name: source.replace(/\bmy\b/i, '').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase()),
          description: '',
          category: '',
        },
        starterName: source.replace(/\bmy\b/i, '').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase()),
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
          description: '',
          system_prompt: 'Help daily.',
          soul_content: '',
          model_hint: '',
          plugins: [],
          skills: [],
          tool_servers: [],
          tool_permission_policy: null,
          memory_enabled: false,
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
          objective: '',
          members: [],
          edges: [],
          channel_hints: [],
          eval_pack: [],
        },
      })

      expect(normalized.project.name.toLowerCase()).not.toMatch(/^(create|build|launch)\b/)
      expect(normalized.starterName?.toLowerCase()).not.toMatch(/^(create|build|launch)\b/)
    }
  })

  it('fills missing template params from natural chat answers', async () => {
    const draft = buildDraftFromTemplate(supportTemplate)

    const result = await refineGeneratedDraft({
      prompt: 'Company name is Acme Support',
      draft,
      templates: [supportTemplate],
      strongModel: 'test-model',
    })

    expect(result.draft.template?.params.company_name).toBe('Acme Support')
    expect(result.missing_required_inputs).toEqual([])
    expect(result.reasoning_summary).toContain('Company name')
  })
})
