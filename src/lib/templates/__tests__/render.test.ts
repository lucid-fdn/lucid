import { describe, expect, it } from 'vitest'
import type { AgentTemplateSpec, TeamTemplateSpec } from '@contracts/template'
import { renderTemplate, substituteString } from '../render'

describe('substituteString', () => {
  it('replaces basic placeholders', () => {
    expect(substituteString('Hello {{NAME}}', { NAME: 'Lucid' })).toBe('Hello Lucid')
  })

  it('leaves missing params untouched', () => {
    expect(substituteString('Hello {{NAME}}', {})).toBe('Hello {{NAME}}')
  })

  it('treats undefined param values as missing', () => {
    expect(substituteString('Hello {{NAME}}', { NAME: undefined })).toBe('Hello {{NAME}}')
  })

  it('handles empty strings', () => {
    expect(substituteString('{{VALUE}}', { VALUE: '' })).toBe('')
  })

  it('preserves special characters in param values', () => {
    expect(substituteString('{{VALUE}}', { VALUE: 'a+b.$^[](){}?|\\' })).toBe('a+b.$^[](){}?|\\')
  })

  it('accepts undefined params safely', () => {
    expect(substituteString('{{VALUE}}', undefined)).toBe('{{VALUE}}')
  })
})

describe('renderTemplate', () => {
  it('renders nested objects and arrays for agent specs', () => {
    const spec: AgentTemplateSpec = {
      kind: 'agent',
      system_prompt: 'You work for {{COMPANY_NAME}}.',
      soul_content: 'Brand: {{COMPANY_NAME}}',
      plugins: ['slack'],
      skills: ['crm'],
      memory_enabled: true,
      memory_strategy: 'auto',
      approval_required_tools: ['notify_{{CHANNEL}}'],
    }

    const rendered = renderTemplate(spec, {
      COMPANY_NAME: 'Acme',
      CHANNEL: 'ops',
      UNUSED: 'ignored',
    }) as AgentTemplateSpec

    expect(rendered).toEqual({
      ...spec,
      system_prompt: 'You work for Acme.',
      soul_content: 'Brand: Acme',
      approval_required_tools: ['notify_ops'],
    })
    expect(spec.system_prompt).toBe('You work for {{COMPANY_NAME}}.')
  })

  it('renders team specs recursively', () => {
    const spec: TeamTemplateSpec = {
      kind: 'team',
      objective: 'Launch {{TOPIC}}',
      members: [
        {
          role: '{{TOPIC}} strategist',
          system_prompt: 'Plan {{TOPIC}}',
          plugins: ['notion'],
          is_coordinator: true,
        },
        {
          role: 'writer',
          system_prompt: 'Write about {{TOPIC}} for {{AUDIENCE}}',
          skills: ['seo'],
        },
      ],
      edges: [
        { from: '{{TOPIC}} strategist', to: 'writer', label: 'brief {{TOPIC}}' },
      ],
    }

    const rendered = renderTemplate(spec, {
      TOPIC: 'AI',
      AUDIENCE: 'operators',
    }) as TeamTemplateSpec

    expect(rendered.objective).toBe('Launch AI')
    expect(rendered.members[0].role).toBe('AI strategist')
    expect(rendered.members[1].system_prompt).toBe('Write about AI for operators')
    expect(rendered.edges[0]).toEqual({
      from: 'AI strategist',
      to: 'writer',
      label: 'brief AI',
    })
  })

  it('returns a new object when params are missing', () => {
    const spec: AgentTemplateSpec = {
      kind: 'agent',
      system_prompt: 'Hello {{NAME}}',
    }

    const rendered = renderTemplate(spec, null) as AgentTemplateSpec

    expect(rendered).not.toBe(spec)
    expect(rendered.system_prompt).toBe('Hello {{NAME}}')
  })

  it('preserves memory_schema and default_schedules intact through substitution', () => {
    const spec: AgentTemplateSpec = {
      kind: 'agent',
      system_prompt: 'You work for {{COMPANY}}.',
      memory_schema: [
        { category: 'fact', description: 'Remember {{COMPANY}} customers', importance_floor: 0.7 },
        { category: 'preference', description: 'Remember user preferences', importance_floor: 0.5 },
      ],
      default_schedules: [
        { cron: '0 9 * * 1', prompt: 'Run the weekly report for {{COMPANY}}', description: 'Weekly audit', optional: false },
      ],
      channel_hints: [
        { channel_type: 'slack', required: true, setup_note: 'Connect Slack for {{COMPANY}} alerts' },
      ],
    }

    const rendered = renderTemplate(spec, { COMPANY: 'Acme' }) as AgentTemplateSpec

    // Substitution should apply inside string fields of nested objects
    expect(rendered.system_prompt).toBe('You work for Acme.')
    expect(rendered.memory_schema?.[0].description).toBe('Remember Acme customers')
    expect(rendered.memory_schema?.[1].description).toBe('Remember user preferences')
    expect(rendered.default_schedules?.[0].prompt).toBe('Run the weekly report for Acme')
    expect(rendered.channel_hints?.[0].setup_note).toBe('Connect Slack for Acme alerts')

    // Numeric and boolean fields must survive untouched
    expect(rendered.memory_schema?.[0].importance_floor).toBe(0.7)
    expect(rendered.memory_schema?.[0].category).toBe('fact')
    expect(rendered.default_schedules?.[0].optional).toBe(false)
    expect(rendered.default_schedules?.[0].cron).toBe('0 9 * * 1')
    expect(rendered.channel_hints?.[0].required).toBe(true)
  })

  it('preserves eval_pack scenarios intact through substitution', () => {
    const spec: AgentTemplateSpec = {
      kind: 'agent',
      system_prompt: 'Agent for {{COMPANY}}',
      eval_pack: [
        {
          name: '{{COMPANY}} greeting test',
          prompt: 'What do you do for {{COMPANY}}?',
          expected_behaviors: ['mention {{COMPANY}}', 'be helpful'],
          must_not_contain: ['competitor'],
        },
      ],
    }

    const rendered = renderTemplate(spec, { COMPANY: 'Acme' }) as AgentTemplateSpec

    expect(rendered.eval_pack?.[0].name).toBe('Acme greeting test')
    expect(rendered.eval_pack?.[0].prompt).toBe('What do you do for Acme?')
    expect(rendered.eval_pack?.[0].expected_behaviors[0]).toBe('mention Acme')
    expect(rendered.eval_pack?.[0].must_not_contain?.[0]).toBe('competitor')
  })
})
