import { describe, expect, it } from 'vitest'

import {
  buildBlankAssistedSessionSeed,
  buildTemplateAssistedSessionSeed,
} from '@/lib/agent-builder/builder-session-seed'
import { deriveBuilderDecisionCards } from '@/lib/ai/project-generation/chat'
import type { TemplateCatalogEntry } from '@contracts/template'

describe('builder session seeds', () => {
  it('creates a blank assisted draft with chat context', () => {
    const seed = buildBlankAssistedSessionSeed()

    expect(seed.result.mode).toBe('blank-agent')
    expect(seed.result.draft.project.name).toBe('')
    expect(seed.result.draft.project.description).toBeUndefined()
    expect(seed.result.draft.starterName).toBeUndefined()
    expect(seed.result.draft.agent?.system_prompt).toBe('')
    expect(seed.result.blueprint.project.name).toBe('')
    expect(seed.result.blueprint.items[0]?.name).toBe('')
    expect(seed.result.blueprint.items[0]?.source).toBe('blank')
    expect(seed.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('creates a template assisted draft with default params', () => {
    const template = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'support-agent',
      name: 'Support Agent',
      description: 'Handle customer support.',
      kind: 'agent',
      category: 'Support',
      source: 'platform',
      status: 'approved',
      is_public: true,
      owner_org_id: null,
      tags: [],
      install_count: 10,
      preview_prompt: null,
      created_by: null,
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      params: [
        {
          key: 'brand',
          label: 'Brand',
          type: 'text',
          required: true,
          default: 'Lucid',
        },
      ],
      spec: {
        kind: 'agent',
        system_prompt: 'Support customers.',
      },
    } satisfies TemplateCatalogEntry

    const seed = buildTemplateAssistedSessionSeed(template)

    expect(seed.result.mode).toBe('template')
    expect(seed.result.selected_template?.slug).toBe('support-agent')
    expect(seed.result.draft.template?.params.brand).toBe('Lucid')
    expect(seed.result.draft.agent?.system_prompt).toBe('Support customers.')
    expect(seed.result.blueprint.items[0]?.source).toBe('template')
  })

  it('hydrates team template previews with capabilities, memory, schedules, and required inputs', () => {
    const template = {
      id: '11111111-1111-4111-8111-111111111112',
      slug: 'authority-engine',
      name: 'Authority Engine',
      description: 'Create an authority content package.',
      kind: 'team',
      category: 'Content',
      source: 'platform',
      status: 'approved',
      is_public: true,
      owner_org_id: null,
      tags: [],
      install_count: 10,
      preview_prompt: 'Create content for customer support AI',
      created_by: null,
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      params: [
        {
          key: 'BRAND_NAME',
          label: 'Brand Name',
          type: 'text',
          required: true,
        },
        {
          key: 'TOPIC',
          label: 'Topic',
          type: 'text',
          required: true,
          default: 'AI support',
        },
      ],
      spec: {
        kind: 'team',
        objective: 'Create authority content for {{BRAND_NAME}} about {{TOPIC}}.',
        members: [
          {
            role: 'strategist',
            system_prompt: 'Research {{TOPIC}}.',
            plugins: ['brave-search'],
            default_schedules: [{
              cron: '0 9 * * 1',
              prompt: 'Audit {{TOPIC}} opportunities.',
              description: 'Weekly audit',
              optional: true,
            }],
          },
          {
            role: 'editor',
            is_coordinator: true,
            system_prompt: 'Publish for {{BRAND_NAME}}.',
            plugins: ['notion'],
            memory_schema: [{
              category: 'preference',
              description: 'Remember {{BRAND_NAME}} voice.',
              importance_floor: 0.7,
            }],
          },
        ],
        edges: [{ from: 'strategist', to: 'editor' }],
        channel_hints: [{
          channel_type: 'slack',
          required: false,
          setup_note: 'Notify the team.',
        }],
      },
    } satisfies TemplateCatalogEntry

    const seed = buildTemplateAssistedSessionSeed(template)

    expect(seed.messages[1]?.parts).toEqual([{
      type: 'text',
      text: 'I loaded the Authority Engine template. To complete it, tell me Brand Name, or fill them in on the right.',
    }])
    expect(seed.result.draft.sourcePrompt).toBe('Create content for customer support AI')
    expect(seed.result.draft.team?.objective).toBe('Create authority content for {{BRAND_NAME}} about AI support.')
    expect(seed.result.draft.team?.members.flatMap((member) => member.plugins ?? [])).toEqual(['brave-search', 'notion'])
    expect(seed.result.draft.team?.members[0]?.default_schedules?.[0]?.prompt).toBe('Audit AI support opportunities.')
    expect(seed.result.draft.team?.members[1]?.memory_schema?.[0]?.description).toBe('Remember {{BRAND_NAME}} voice.')
    expect(seed.result.missing_required_inputs).toEqual([{
      key: 'BRAND_NAME',
      label: 'Brand Name',
      reason: 'Authority Engine requires this value before deploy',
    }])
    expect(deriveBuilderDecisionCards(seed.result)[0]).toEqual({
      kind: 'template_param',
      key: 'BRAND_NAME',
      label: 'Brand Name',
      reason: 'Authority Engine requires this value before deploy',
      placeholder: 'Authority Engine requires this value before deploy',
    })
  })
})
