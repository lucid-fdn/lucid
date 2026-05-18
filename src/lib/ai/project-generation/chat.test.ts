import { describe, expect, it } from 'vitest'

import {
  buildProjectBuilderAssistantMessage,
  buildProjectBuilderFollowUpQuestion,
  buildProjectBuilderMetaReply,
  deriveBuilderDecisionCards,
  deriveBuilderStage,
} from './chat'
import type { GeneratedBlueprintResult } from './schemas'

describe('buildProjectBuilderAssistantMessage', () => {
  it('describes an initial single-agent draft and points the user to the preview', () => {
    const message = buildProjectBuilderAssistantMessage({
      prompt: 'Build me a personal assistant',
      isInitial: true,
      result: {
        mode: 'blank-agent',
        draft: {
          version: '1.0',
          mode: 'blank-agent',
          project: { name: 'Personal Assistant' },
          agent: {
            kind: 'agent',
            system_prompt: 'You are helpful.',
          },
        },
        blueprint: {
          version: '1.0',
          project: { name: 'Personal Assistant' },
          items: [
            {
              kind: 'agent',
              source: 'blank',
              name: 'Personal Assistant',
              spec: {
                kind: 'agent',
                system_prompt: 'You are helpful.',
              },
            },
          ],
        },
        reasoning_summary: 'Built a focused single-agent starter',
        template_matches: [],
        suggested_integrations: ['email', 'calendar', 'tasks'],
        warnings: [],
        missing_required_inputs: [],
        confidence: 0.82,
      } satisfies GeneratedBlueprintResult,
    })

    expect(message).toContain('I drafted a single agent')
    expect(message).toContain('email, calendar, and tasks')
  })

  it('surfaces unsupported channel warnings in the assistant message', () => {
    const message = buildProjectBuilderAssistantMessage({
      prompt: 'Create an agent that answers DMs on X',
      isInitial: true,
      result: {
        mode: 'blank-agent',
        draft: {
          version: '1.0',
          mode: 'blank-agent',
          project: { name: 'DM Assistant' },
          agent: {
            kind: 'agent',
            system_prompt: 'Help with supported messages.',
          },
        },
        blueprint: {
          version: '1.0',
          project: { name: 'DM Assistant' },
          items: [
            {
              kind: 'agent',
              source: 'blank',
              name: 'DM Assistant',
              spec: {
                kind: 'agent',
                system_prompt: 'Help with supported messages.',
              },
            },
          ],
        },
        reasoning_summary: 'Built a messaging assistant starter',
        template_matches: [],
        suggested_integrations: [],
        warnings: [
          'Unsupported channel: X is not available as a built-in Lucid channel or selected capability yet. Choose a supported channel, add a matching capability if available, or connect it through a custom integration before relying on this automation.',
        ],
        missing_required_inputs: [],
        confidence: 0.82,
      } satisfies GeneratedBlueprintResult,
    })

    expect(message).toContain('Unsupported channel: X')
    expect(message).toContain('Refine tone, tools, runtime, or structure next if you want.')
  })

  it('calls out missing required inputs for template drafts', () => {
    const message = buildProjectBuilderAssistantMessage({
      prompt: 'Build a sales assistant',
      isInitial: false,
      result: {
        mode: 'template',
        draft: {
          version: '1.0',
          mode: 'template',
          project: { name: 'Sales Assistant' },
          template: {
            slug: 'sales-follow-up',
            name: 'Sales Follow-up',
            kind: 'agent',
            params: {},
          },
        },
        blueprint: {
          version: '1.0',
          project: { name: 'Sales Assistant' },
          items: [
            {
              kind: 'agent',
              source: 'template',
              template_slug: 'sales-follow-up',
              name: 'Sales Follow-up',
            },
          ],
        },
        reasoning_summary: 'Used the sales follow-up template',
        template_matches: [],
        selected_template: {
          slug: 'sales-follow-up',
          name: 'Sales Follow-up',
          kind: 'agent',
          params: {},
        },
        suggested_integrations: [],
        warnings: [],
        missing_required_inputs: [
          { key: 'crm', label: 'CRM', reason: 'Needed to connect the template' },
          { key: 'sender', label: 'Sender email', reason: 'Needed to send follow-ups' },
        ],
        confidence: 0.9,
      } satisfies GeneratedBlueprintResult,
    })

    expect(message).toContain('Base: Sales Follow-up.')
    expect(message).toContain('I still need CRM and Sender email')
  })

  it('derives decision cards and stage hints from blocking template inputs', () => {
    const result = {
      mode: 'template',
      draft: {
        version: '1.0',
        mode: 'template',
        project: { name: 'Sales Assistant' },
        template: {
          slug: 'sales-follow-up',
          name: 'Sales Follow-up',
          kind: 'agent',
          params: {},
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Sales Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'template',
            template_slug: 'sales-follow-up',
            name: 'Sales Follow-up',
          },
        ],
      },
      reasoning_summary: 'Used the sales follow-up template',
      template_matches: [],
      suggested_integrations: [],
      warnings: [],
      missing_required_inputs: [
        { key: 'crm', label: 'CRM', reason: 'Needed to connect the template' },
      ],
      confidence: 0.9,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result)
    expect(cards.some((card) => card.kind === 'template_param')).toBe(true)
    expect(cards.some((card) => card.kind === 'runtime_mode')).toBe(false)
    expect(deriveBuilderStage({ result, decisionCards: cards })).toBe('create-agent')
  })

  it('derives a capability step when the builder has likely skills or plugins to add', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Agent' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Personal Agent' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Personal Agent',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a personal assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar'],
      suggested_capabilities: {
        skills: [{ slug: 'calendar-ops', name: 'Calendar Ops', source: 'catalog' }],
        plugins: [{ slug: 'gmail', name: 'Gmail', installed: false }],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [
      {
        id: 'gmail',
        slug: 'gmail',
        name: 'Gmail',
        description: 'Email integration',
        category: 'communication',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: null,
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
      {
        id: 'calendar-ops',
        slug: 'calendar-ops',
        name: 'Calendar Ops',
        description: 'Calendar planning',
        category: 'productivity',
        item_type: 'skill',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: false,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: null,
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
      {
        id: 'notes',
        slug: 'notes',
        name: 'Notes',
        description: 'Capture notes',
        category: 'productivity',
        item_type: 'skill',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: false,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: null,
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
    ])
    const capabilityCard = cards.find((card) => card.kind === 'capability_multi_select')

    expect(capabilityCard?.kind).toBe('capability_multi_select')
    if (capabilityCard?.kind === 'capability_multi_select') {
      expect(capabilityCard.options.map((option) => option.slug)).toContain('calendar-ops')
      expect(capabilityCard.options.map((option) => option.slug)).toContain('gmail')
      expect(capabilityCard.browse_action_label).toBe('Browse all skills')
    }
  })

  it('falls back to curated capability aliases for broad personal assistant prompts', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Daily Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Daily Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Daily Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a personal assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar', 'tasks'],
      profile_hint: {
        id: 'personal-agent',
        label: 'Personal agent',
        description: 'A daily operator.',
        suggested_integrations: ['email', 'calendar', 'tasks'],
        follow_up_question: 'Should it lean more into email, calendar planning, or task execution?',
      },
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [
      {
        id: 'google-workspace',
        slug: 'google-workspace',
        name: 'Google Workspace',
        description: 'Google Calendar and Gmail access',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: 'google',
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
      {
        id: 'asana',
        slug: 'asana',
        name: 'Asana',
        description: 'Task management',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: 'asana',
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
    ])

    const capabilityCard = cards.find((card) => card.kind === 'capability_multi_select')
    expect(capabilityCard?.kind).toBe('capability_multi_select')
    if (capabilityCard?.kind === 'capability_multi_select') {
      expect(capabilityCard.options.map((option) => option.slug)).toContain('google-workspace')
      expect(capabilityCard.options.map((option) => option.slug)).toContain('asana')
    }
  })

  it('still derives a capability step for generic assistant drafts when structured suggestions are empty', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are a helpful personal assistant.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are a helpful personal assistant.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a broad assistant starter.',
      template_matches: [],
      suggested_integrations: [],
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.77,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [
      {
        id: 'google-workspace',
        slug: 'google-workspace',
        name: 'Google',
        description: 'Email and calendar integration',
        category: 'communication',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: 'google',
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
      {
        id: 'notion',
        slug: 'notion',
        name: 'Notion',
        description: 'Notes and workspace docs',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: null,
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
      {
        id: 'asana',
        slug: 'asana',
        name: 'Asana',
        description: 'Tasks and project tracking',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: null,
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
    ])

    const capabilityCard = cards.find((card) => card.kind === 'capability_multi_select')
    expect(capabilityCard?.kind).toBe('capability_multi_select')
    if (capabilityCard?.kind === 'capability_multi_select') {
      expect(capabilityCard.options.length).toBeGreaterThan(0)
      expect(capabilityCard.options.map((option) => option.slug)).toContain('google-workspace')
    }
  })

  it('prefers the profile follow-up question when available', () => {
    const question = buildProjectBuilderFollowUpQuestion({
      prompt: 'create my personal agent',
      result: {
        mode: 'blank-agent',
        draft: {
          version: '1.0',
          mode: 'blank-agent',
          project: { name: 'Personal Agent' },
          agent: {
            kind: 'agent',
            system_prompt: 'You are helpful.',
          },
        },
        blueprint: {
          version: '1.0',
          project: { name: 'Personal Agent' },
          items: [
            {
              kind: 'agent',
              source: 'blank',
              name: 'Personal Agent',
              spec: {
                kind: 'agent',
                system_prompt: 'You are helpful.',
              },
            },
          ],
        },
        reasoning_summary: 'Built a personal assistant starter',
        template_matches: [],
        suggested_integrations: ['email', 'calendar', 'tasks'],
        profile_hint: {
          id: 'personal-agent',
          label: 'Personal agent',
          description: 'A daily operator.',
          suggested_integrations: ['email', 'calendar', 'tasks'],
          follow_up_question: 'Should it lean more into email, calendar planning, or task execution?',
        },
        warnings: [],
        missing_required_inputs: [],
        confidence: 0.84,
      } satisfies GeneratedBlueprintResult,
    })

    expect(question).toBe('Should it lean more into email, calendar planning, or task execution?')
  })

  it('suppresses the generic follow-up when a blocking clarification step is present', () => {
    const question = buildProjectBuilderFollowUpQuestion({
      prompt: 'create assistant',
      result: {
        mode: 'blank-agent',
        draft: {
          version: '1.0',
          mode: 'blank-agent',
          project: { name: 'Personal Assistant' },
          agent: {
            kind: 'agent',
            system_prompt: 'You are helpful.',
          },
        },
        blueprint: {
          version: '1.0',
          project: { name: 'Personal Assistant' },
          items: [
            {
              kind: 'agent',
              source: 'blank',
              name: 'Personal Assistant',
              spec: {
                kind: 'agent',
                system_prompt: 'You are helpful.',
              },
            },
          ],
        },
        reasoning_summary: 'Built a personal assistant starter',
        template_matches: [],
        suggested_integrations: ['email', 'calendar', 'tasks'],
        clarification: {
          needed: true,
          level: 'low',
          ambiguity_class: 'topology',
          reason: 'This request could work either as one operator or as a coordinated team.',
          question: 'Should this stay a single agent or become a team?',
          options: [
            {
              id: 'single-agent',
              label: 'Single agent',
              submit_message: 'Keep this as a single agent.',
            },
          ],
        },
        warnings: [],
        missing_required_inputs: [],
        confidence: 0.66,
      } satisfies GeneratedBlueprintResult,
    })

    expect(question).toBeUndefined()
  })

  it('sequences builder decisions after tools into schedules, then channels, then runtime', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Daily Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Daily Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Daily Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a daily assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar', 'tasks'],
      profile_hint: {
        id: 'personal-agent',
        label: 'Personal agent',
        description: 'A daily operator.',
        suggested_integrations: ['email', 'calendar', 'tasks'],
        follow_up_question: 'Should it lean more into email, calendar planning, or task execution?',
      },
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [
      {
        id: 'google-workspace',
        slug: 'google-workspace',
        name: 'Google Workspace',
        description: 'Google Calendar and Gmail access',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: 'google',
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
    ])

    expect(cards.map((card) => card.kind)).toEqual([
      'capability_multi_select',
      'configuration_panel',
      'configuration_panel',
    ])
    expect(cards[1]).toMatchObject({
      kind: 'configuration_panel',
      panel: 'tasks',
      action_label: 'Edit schedule',
      apply_action_label: 'Add suggested schedule',
      suggested_schedule: {
        description: 'Weekday plan',
        optional: true,
      },
    })
    expect(cards[2]).toMatchObject({
      kind: 'configuration_panel',
      panel: 'channels',
      action_label: 'Set channels',
    })
  })

  it('prepends a clarification step only for blocking topology choices', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Personal Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Personal Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a personal assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar', 'tasks'],
      clarification: {
        needed: true,
        level: 'low',
        ambiguity_class: 'topology',
        reason: 'This request could work either as one operator or as a coordinated team.',
        question: 'Should this stay a single agent or become a team?',
        options: [
          {
            id: 'single-agent',
            label: 'Single agent',
            submit_message: 'Keep this as a single agent.',
          },
          {
            id: 'team',
            label: 'Team',
            submit_message: 'Convert this into a coordinated team.',
          },
        ],
      },
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.66,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [])
    expect(cards[0]).toMatchObject({
      kind: 'clarification_select',
      ambiguity_class: 'topology',
      title: 'Should this stay a single agent or become a team?',
    })
  })

  it('does not block broad assistant setup with a non-blocking focus clarification', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Personal Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Personal Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a personal assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar', 'tasks'],
      clarification: {
        needed: true,
        level: 'medium',
        ambiguity_class: 'focus',
        reason: 'A personal assistant can lean into planning, communication, or execution.',
        question: 'What should this assistant focus on first?',
        options: [
          {
            id: 'calendar',
            label: 'Calendar planning',
            submit_message: 'Focus this assistant on calendar planning first.',
          },
        ],
      },
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.66,
    } satisfies GeneratedBlueprintResult

    const message = buildProjectBuilderAssistantMessage({
      prompt: 'create assistant',
      result,
      isInitial: true,
    })
    const cards = deriveBuilderDecisionCards(result, [])

    expect(message).not.toContain('I need one quick choice')
    expect(cards.some((card) => card.kind === 'clarification_select')).toBe(false)
  })

  it('keeps channels and schedule steps when a template only seeds optional defaults', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          default_schedules: [
            {
              cron: '0 8 * * 1-5',
              prompt: 'Prepare the daily plan.',
              description: 'Weekday morning plan',
              optional: true,
            },
          ],
          channel_hints: [
            {
              channel_type: 'email',
              required: false,
              setup_note: 'Connect email if you want inbox triage.',
            },
            {
              channel_type: 'calendar',
              required: false,
              setup_note: 'Connect calendar if you want planning.',
            },
          ],
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Personal Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Personal Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a personal assistant starter',
      template_matches: [],
      suggested_integrations: ['email', 'calendar', 'tasks'],
      profile_hint: {
        id: 'personal-agent',
        label: 'Personal agent',
        description: 'A daily operator.',
        suggested_integrations: ['email', 'calendar', 'tasks'],
        follow_up_question: 'Should it lean more into email, calendar planning, or task execution?',
      },
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [
      {
        id: 'google-workspace',
        slug: 'google-workspace',
        name: 'Google Workspace',
        description: 'Google Calendar and Gmail access',
        category: 'productivity',
        item_type: 'plugin',
        section: 'installed',
        installed: false,
        is_active: false,
        installation_id: null,
        activation_id: null,
        tools: null,
        enabled_tools: null,
        tool_count: 0,
        can_act: true,
        always_on: false,
        removable: true,
        connection_status: null,
        auth_provider: 'google',
        connection_id: null,
        health_status: null,
        health_message: null,
        expires_at: null,
        content_chars: null,
        version: '1',
        author: null,
        source: 'catalog',
        verified: true,
      },
    ])

    expect(cards.map((card) => card.kind)).toEqual([
      'capability_multi_select',
      'configuration_panel',
      'configuration_panel',
    ])
    expect(cards[1]).toMatchObject({
      kind: 'configuration_panel',
      panel: 'tasks',
      action_label: 'Edit schedule',
      apply_action_label: 'Add suggested schedule',
      suggested_schedule: {
        prompt: 'Prepare the daily plan.',
        description: 'Weekday morning plan',
        optional: true,
      },
    })
    expect(cards[2]).toMatchObject({
      kind: 'configuration_panel',
      panel: 'channels',
    })
  })

  it('skips channels and schedules steps when the draft already has them', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Daily Assistant' },
        runtime: {
          mode: 'shared',
        },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          channel_hints: [{
            channel_type: 'slack',
            required: true,
            setup_note: 'Use Slack for inbound messages.',
          }],
          default_schedules: [{
            cron: '0 8 * * *',
            prompt: 'Send the morning check-in.',
            description: 'Morning check-in',
            optional: false,
          }],
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Daily Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Daily Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a daily assistant starter',
      patch: {
        summary: 'Confirmed channels and scheduling.',
        operations: [
          {
            op: 'set_project_description',
            value: 'Confirmed channels and scheduling.',
          },
        ],
      },
      template_matches: [],
      suggested_integrations: [],
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [])

    expect(cards.map((card) => card.kind)).toEqual([])
  })

  it('keeps the channels step when the draft only has an internal default channel', () => {
    const result = {
      mode: 'blank-agent',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Daily Assistant' },
        runtime: {
          mode: 'shared',
        },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          channel_hints: [{
            channel_type: 'web',
            required: true,
            setup_note: 'Default internal chat surface.',
          }],
          default_schedules: [{
            cron: '0 8 * * *',
            prompt: 'Send the morning check-in.',
            description: 'Morning check-in',
            optional: false,
          }],
        },
      },
      blueprint: {
        version: '1.0',
        project: { name: 'Daily Assistant' },
        items: [
          {
            kind: 'agent',
            source: 'blank',
            name: 'Daily Assistant',
            spec: {
              kind: 'agent',
              system_prompt: 'You are helpful.',
            },
          },
        ],
      },
      reasoning_summary: 'Built a daily assistant starter',
      patch: {
        summary: 'Configured scheduling but left channels open.',
        operations: [
          {
            op: 'set_project_description',
            value: 'Configured scheduling but left channels open.',
          },
        ],
      },
      template_matches: [],
      suggested_integrations: [],
      suggested_capabilities: {
        skills: [],
        plugins: [],
        tool_servers: [],
      },
      warnings: [],
      missing_required_inputs: [],
      confidence: 0.84,
    } satisfies GeneratedBlueprintResult

    const cards = deriveBuilderDecisionCards(result, [])

    expect(cards).toEqual([
      expect.objectContaining({
        kind: 'configuration_panel',
        panel: 'channels',
      }),
    ])
  })
})

describe('buildProjectBuilderMetaReply', () => {
  it('answers runtime availability questions without implying a draft mutation', () => {
    const message = buildProjectBuilderMetaReply({
      prompt: 'what engines are available?',
      classification: {
        type: 'product_question',
        topic: 'runtime',
        reason: 'test classifier result',
        confidence: 0.95,
      },
    })

    expect(message).toContain('Shared, Dedicated, and Bring your own')
    expect(message).not.toContain('updated')
  })

  it('answers generic runtime questions without falling back to builder status', () => {
    const message = buildProjectBuilderMetaReply({
      prompt: 'what are runtimes?',
      classification: {
        type: 'product_question',
        topic: 'runtime',
        reason: 'test classifier result',
        confidence: 0.95,
      },
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          skills: ['bear-notes'],
          channel_hints: [{ channel_type: 'web', required: false, setup_note: '' }],
        },
      },
    })

    expect(message).toContain('Runtimes are where the agent actually runs')
    expect(message).toContain('Shared, Dedicated, and Bring your own')
    expect(message).not.toContain('bear-notes')
  })

  it('answers builder status questions from the current draft state', () => {
    const message = buildProjectBuilderMetaReply({
      prompt: 'what are you doing?',
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          skills: ['gmail', 'calendar'],
        },
      },
    })

    expect(message).toContain('I\'m shaping a single agent for "Personal Assistant".')
    expect(message).toContain('gmail and calendar')
  })

  it('answers readiness questions with what is actually missing before create', () => {
    const message = buildProjectBuilderMetaReply({
      prompt: "what's missing in your opinion before we create?",
      draft: {
        version: '1.0',
        mode: 'blank-agent',
        project: { name: 'Personal Assistant' },
        agent: {
          kind: 'agent',
          system_prompt: 'You are helpful.',
          plugins: ['google-workspace'],
          channel_hints: [{ channel_type: 'web', required: true, setup_note: '' }],
          default_schedules: [{
            cron: '0 8 * * 1-5',
            prompt: 'Prepare the daily plan.',
            description: 'Weekday plan',
            optional: false,
          }],
        },
      },
      availableUnifiedSkills: [
        {
          id: 'google-workspace',
          slug: 'google-workspace',
          name: 'Google Workspace',
          description: 'Calendar and Gmail access',
          category: 'productivity',
          item_type: 'plugin',
          section: 'installed',
          installed: true,
          is_active: true,
          installation_id: null,
          activation_id: null,
          tools: null,
          enabled_tools: null,
          tool_count: 0,
          can_act: true,
          always_on: false,
          removable: true,
          connection_status: 'setup_required',
          auth_provider: 'google',
          connection_id: null,
          health_status: null,
          health_message: null,
          expires_at: null,
          content_chars: null,
          version: '1',
          author: null,
          source: 'catalog',
          verified: true,
        },
      ],
    })

    expect(message).toContain('Before creating')
    expect(message).toContain('choose where it should work')
    expect(message).toContain('connect Google Workspace')
    expect(message).not.toContain("I'm shaping")
  })

  it('answers generic validation requirement questions without mutating the draft', () => {
    const message = buildProjectBuilderMetaReply({
      prompt: 'what needs to be indicated to validate an agent?',
      classification: {
        type: 'product_question',
        topic: 'validation',
        reason: 'test classifier result',
        confidence: 0.95,
      },
    })

    expect(message).toContain('valid name')
    expect(message).toContain('runtime and engine')
    expect(message).toContain('required template inputs')
    expect(message).not.toContain('updated')
  })
})
