import { describe, expect, it } from 'vitest'

import type { ProjectBlueprint } from '@contracts/project-blueprint'
import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'

import { buildBuilderConfigBlueprint } from './builder-config-blueprint'
import {
  parseProjectBlueprint,
  serializeProjectBlueprint,
  type BlueprintConfigFormat,
} from './blueprint-serialization'

function roundTrip(blueprint: ProjectBlueprint, format: BlueprintConfigFormat): ProjectBlueprint {
  return parseProjectBlueprint(serializeProjectBlueprint(blueprint, format), format)
}

describe('builder config blueprint', () => {
  it('leaves non-template blueprints unchanged', () => {
    const blueprint: ProjectBlueprint = {
      version: '1.0',
      project: {
        name: 'Personal Assistant',
        description: 'Daily assistance',
      },
      items: [
        {
          kind: 'agent',
          source: 'blank',
          name: 'Personal Assistant',
          spec: {
            kind: 'agent',
            description: 'Daily assistance',
            system_prompt: 'Help with daily work.',
          },
        },
      ],
    }
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-agent',
      project: blueprint.project,
      starterName: 'Personal Assistant',
      agent: blueprint.items[0].kind === 'agent' && blueprint.items[0].source === 'blank'
        ? blueprint.items[0].spec
        : undefined,
    }

    expect(buildBuilderConfigBlueprint(blueprint, draft)).toBe(blueprint)
  })

  it.each(['json', 'yaml'] as const)('resolves agent templates to editable %s config', (format) => {
    const blueprint: ProjectBlueprint = {
      version: '1.0',
      project: {
        name: 'Inbox Agent',
        description: 'Owns inbox triage',
      },
      items: [
        {
          kind: 'agent',
          source: 'template',
          template_slug: 'inbox-agent',
          name: 'Inbox Agent',
          params: {
            TEAM: 'support',
          },
        },
      ],
    }
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'template',
      project: blueprint.project,
      starterName: 'Inbox Agent',
      runtime: {
        mode: 'shared',
        engine: 'openclaw',
      },
      template: {
        slug: 'inbox-agent',
        name: 'Inbox Agent',
        kind: 'agent',
        params: {
          TEAM: 'support',
        },
      },
      agent: {
        kind: 'agent',
        description: 'Triage the support inbox.',
        system_prompt: 'Triage incoming support mail and escalate blockers.',
        memory_enabled: true,
        skills: ['gmail'],
      },
    }

    const config = buildBuilderConfigBlueprint(blueprint, draft)

    expect(config?.items[0]).toMatchObject({
      kind: 'agent',
      source: 'blank',
      name: 'Inbox Agent',
      runtime: {
        mode: 'shared',
        engine: 'openclaw',
      },
      spec: {
        kind: 'agent',
        system_prompt: 'Triage incoming support mail and escalate blockers.',
      },
    })
    expect(roundTrip(config!, format)).toEqual(config)
  })

  it.each(['json', 'yaml'] as const)('resolves team templates to editable %s config', (format) => {
    const blueprint: ProjectBlueprint = {
      version: '1.0',
      project: {
        name: 'Authority Engine',
        description: 'Create researched article packages.',
        category: 'content',
      },
      items: [
        {
          kind: 'team',
          source: 'template',
          template_slug: 'content-machine',
          name: 'Authority Engine',
          params: {
            BRAND_NAME: 'Lucid',
          },
        },
      ],
    }
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'template',
      project: blueprint.project,
      starterName: 'Authority Engine',
      template: {
        slug: 'content-machine',
        name: 'Authority Engine',
        kind: 'team',
        params: {
          BRAND_NAME: 'Lucid',
        },
      },
      team: {
        kind: 'team',
        objective: 'Create researched, SEO-ready article packages.',
        members: [
          {
            role: 'Coordinator',
            is_coordinator: true,
            description: 'Owns final output quality.',
            responsibilities: ['Assign work', 'Merge the package'],
            system_prompt: 'Coordinate the content team.',
            system_prompt_mode: 'manual',
          },
          {
            role: 'Search Strategist',
            description: 'Finds search intent and article angles.',
            responsibilities: ['Research SERP', 'Select keywords'],
            system_prompt: 'Research the topic.',
            system_prompt_mode: 'auto',
            skills: ['brave-search'],
          },
        ],
        edges: [
          {
            from: 'Coordinator',
            to: 'Search Strategist',
            label: 'delegates research',
          },
        ],
      },
    }

    const config = buildBuilderConfigBlueprint(blueprint, draft)

    expect(config?.items[0]).toMatchObject({
      kind: 'team',
      source: 'blank',
      name: 'Authority Engine',
      spec: {
        kind: 'team',
        members: [
          {
            role: 'Coordinator',
            system_prompt_mode: 'manual',
          },
          {
            role: 'Search Strategist',
            system_prompt_mode: 'auto',
          },
        ],
      },
    })
    expect(roundTrip(config!, format)).toEqual(config)
  })
})
