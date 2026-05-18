import type { ProjectBlueprint } from '@contracts/project-blueprint'
import type {
  AgentTemplateSpec,
  TeamTemplateSpec,
  TemplateCatalogEntry,
  TemplateSpec,
} from '@contracts/template'

import {
  generationDraftSchema,
  type GenerationDraft,
  type GenerationPatch,
  type GenerationPatchOperation,
} from './schemas'
import { normalizeTeamSystemPrompts } from './team-member-prompt'

export interface GenerationDraftTemplateContext {
  slug: string
  name: string
  kind: 'agent' | 'team'
  params?: Record<string, string>
}

export function createBlankAgentDraft(input: {
  prompt?: string
  projectName: string
  projectDescription?: string
  starterName?: string
  systemPrompt: string
  category?: string
  runtime?: GenerationDraft['runtime']
}): GenerationDraft {
  return generationDraftSchema.parse({
    version: '1.0',
    sourcePrompt: input.prompt,
    mode: 'blank-agent',
    project: {
      name: input.projectName,
      ...(input.projectDescription ? { description: input.projectDescription } : {}),
      ...(input.category ? { category: input.category } : {}),
    },
    ...(input.starterName ? { starterName: input.starterName } : {}),
    ...(input.runtime ? { runtime: input.runtime } : {}),
    agent: {
      kind: 'agent',
      system_prompt: input.systemPrompt,
    },
  })
}

export function buildDraftFromTemplate(
  template: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'category'> & {
    description?: string | null
    spec?: TemplateSpec
  },
  input: {
    prompt?: string
    projectName?: string
    projectDescription?: string
    runtime?: GenerationDraft['runtime']
    params?: Record<string, string>
  } = {},
): GenerationDraft {
  const params = normalizeStringRecord(input.params)
  const previewSpec = template.spec ? hydrateTemplateSpec(template.spec, params) : undefined

  return generationDraftSchema.parse({
    version: '1.0',
    sourcePrompt: input.prompt,
    mode: 'template',
    project: {
      name: input.projectName?.trim() || template.name,
      ...(input.projectDescription?.trim()
        ? { description: input.projectDescription.trim() }
        : template.description
          ? { description: template.description }
          : {}),
      ...(template.category ? { category: template.category } : {}),
    },
    starterName: template.name,
    ...(input.runtime ? { runtime: input.runtime } : {}),
    template: {
      slug: template.slug,
      name: template.name,
      kind: template.kind,
      params,
    },
    ...(previewSpec?.kind === 'agent' ? { agent: normalizeTemplateAgentPreview(previewSpec) } : {}),
    ...(previewSpec?.kind === 'team' ? { team: previewSpec } : {}),
  })
}

export function applyTemplateParamsToDraft(
  draft: GenerationDraft,
  template: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'spec'>,
  params: Record<string, string>,
): GenerationDraft {
  const normalizedParams = normalizeStringRecord(params)
  const previewSpec = hydrateTemplateSpec(template.spec, normalizedParams)

  return generationDraftSchema.parse({
    ...draft,
    mode: 'template',
    template: {
      slug: template.slug,
      name: template.name,
      kind: template.kind,
      params: normalizedParams,
    },
    agent: previewSpec.kind === 'agent' ? normalizeTemplateAgentPreview(previewSpec) : undefined,
    team: previewSpec.kind === 'team' ? previewSpec : undefined,
  })
}

export function projectBlueprintFromDraft(draft: GenerationDraft): ProjectBlueprint {
  const project = {
    name: draft.project.name.trim(),
    ...(draft.project.description?.trim() ? { description: draft.project.description.trim() } : {}),
    ...(draft.project.category?.trim() ? { category: draft.project.category.trim() } : {}),
  }

  if (draft.mode === 'template') {
    if (!draft.template) {
      throw new Error('Template draft is missing its template reference')
    }

    return {
      version: '1.0',
      project,
      items: [
        {
          kind: draft.template.kind,
          source: 'template',
          template_slug: draft.template.slug,
          name: draft.starterName ?? draft.template.name,
          ...(Object.keys(draft.template.params).length > 0 ? { params: draft.template.params } : {}),
          ...(draft.runtime ? { runtime: draft.runtime } : {}),
        },
      ],
      ...(draft.work_graph ? { work_graph: draft.work_graph } : {}),
    }
  }

  if (draft.mode === 'blank-agent') {
    if (!draft.agent) {
      throw new Error('Blank agent draft is missing its agent spec')
    }

    return {
      version: '1.0',
      project,
      items: [
        {
          kind: 'agent',
          source: 'blank',
          name: draft.starterName ?? project.name,
          spec: draft.agent,
          ...(draft.runtime ? { runtime: draft.runtime } : {}),
        },
      ],
      ...(draft.work_graph ? { work_graph: draft.work_graph } : {}),
    }
  }

  if (!draft.team) {
    throw new Error('Blank team draft is missing its team spec')
  }

  const normalizedTeam = normalizeTeamSystemPrompts(draft.team)

  return {
    version: '1.0',
    project,
    items: [
      {
        kind: 'team',
        source: 'blank',
        name: draft.starterName ?? project.name,
        spec: normalizedTeam,
        ...(draft.runtime ? { runtime: draft.runtime } : {}),
      },
    ],
    ...(draft.work_graph ? { work_graph: draft.work_graph } : {}),
  }
}

export function applyGenerationPatch(
  draft: GenerationDraft,
  patch: GenerationPatch,
): GenerationDraft {
  let next = structuredClone(draft) as GenerationDraft

  for (const operation of patch.operations) {
    next = applyOperation(next, operation)
  }

  return generationDraftSchema.parse(next)
}

function applyOperation(
  draft: GenerationDraft,
  operation: GenerationPatchOperation,
): GenerationDraft {
  switch (operation.op) {
    case 'set_project_name':
      return {
        ...draft,
        project: {
          ...draft.project,
          name: operation.value,
        },
      }
    case 'set_project_description':
      return {
        ...draft,
        project: {
          ...draft.project,
          description: operation.value || undefined,
        },
      }
    case 'set_runtime_mode':
      return {
        ...draft,
        runtime: {
          mode: operation.mode,
          ...(operation.engine ? { engine: operation.engine } : {}),
          ...(operation.provider && operation.mode === 'byo' ? { provider: operation.provider } : {}),
        },
      }
    case 'replace_template':
      return {
        version: draft.version,
        ...(draft.sourcePrompt ? { sourcePrompt: draft.sourcePrompt } : {}),
        mode: 'template',
        project: draft.project,
        ...(draft.starterName ? { starterName: draft.starterName } : {}),
        ...(draft.runtime ? { runtime: draft.runtime } : {}),
        ...(draft.work_graph ? { work_graph: draft.work_graph } : {}),
        template: {
          ...operation.template,
          params: normalizeStringRecord(operation.template.params),
        },
      }
    case 'set_template_param':
      return {
        ...draft,
        template: {
          slug: draft.template?.slug ?? '',
          name: draft.template?.name ?? draft.project.name,
          kind: draft.template?.kind ?? 'agent',
          params: {
            ...(draft.template?.params ?? {}),
            [operation.key]: operation.value,
          },
        },
      }
    case 'update_agent_prompt':
      return {
        ...draft,
        mode: 'blank-agent',
        team: undefined,
        template: undefined,
        agent: {
          kind: 'agent',
          ...(draft.agent ?? {}),
          system_prompt: operation.system_prompt,
        },
      }
    case 'update_agent_spec':
      return {
        ...draft,
        mode: 'blank-agent',
        team: undefined,
        template: undefined,
        agent: {
          ...operation.spec,
          kind: 'agent',
        },
      }
    case 'set_starter_name':
      return {
        ...draft,
        starterName: operation.value,
      }
    case 'convert_agent_to_team':
      return {
        ...draft,
        mode: 'blank-team',
        template: undefined,
        agent: undefined,
        team: {
          kind: 'team',
          ...(operation.objective ? { objective: operation.objective } : {}),
          members: operation.members,
          edges: operation.edges,
        },
      }
    case 'add_team_member':
      return {
        ...draft,
        mode: 'blank-team',
        template: undefined,
        agent: undefined,
        team: {
          kind: 'team',
          objective: draft.team?.objective,
          members: [...(draft.team?.members ?? []), operation.member],
          edges: draft.team?.edges ?? [],
        },
      }
    case 'remove_team_member': {
      const members = (draft.team?.members ?? []).filter((member) => member.role !== operation.role)
      const edges = (draft.team?.edges ?? []).filter(
        (edge) => edge.from !== operation.role && edge.to !== operation.role,
      )

      return {
        ...draft,
        team: {
          kind: 'team',
          objective: draft.team?.objective,
          members,
          edges,
        },
      }
    }
    case 'set_team_objective':
      return {
        ...draft,
        mode: 'blank-team',
        template: undefined,
        agent: undefined,
        team: {
          kind: 'team',
          members: draft.team?.members ?? [],
          edges: draft.team?.edges ?? [],
          objective: operation.objective || undefined,
        },
      }
    case 'replace_team_spec':
      return {
        ...draft,
        mode: 'blank-team',
        template: undefined,
        agent: undefined,
        team: {
          ...operation.spec,
          kind: 'team',
        },
      }
  }
}

export function generationDraftFromBlueprint(blueprint: ProjectBlueprint): GenerationDraft {
  const item = blueprint.items[0]
  if (!item) {
    throw new Error('Blueprint is missing its first item')
  }

  if (item.source === 'template') {
    return generationDraftSchema.parse({
      version: '1.0',
      mode: 'template',
      project: {
        name: blueprint.project.name,
        ...(blueprint.project.description ? { description: blueprint.project.description } : {}),
        ...(blueprint.project.category ? { category: blueprint.project.category } : {}),
      },
      ...(item.name ? { starterName: item.name } : {}),
      ...(item.runtime ? { runtime: item.runtime } : {}),
      template: {
        slug: item.template_slug,
        name: item.name ?? blueprint.project.name,
        kind: item.kind,
        params: item.params ?? {},
      },
    })
  }

  if (item.kind === 'agent') {
    return generationDraftSchema.parse({
      version: '1.0',
      mode: 'blank-agent',
      project: {
        name: blueprint.project.name,
        ...(blueprint.project.description ? { description: blueprint.project.description } : {}),
        ...(blueprint.project.category ? { category: blueprint.project.category } : {}),
      },
      ...(item.name ? { starterName: item.name } : {}),
      ...(item.runtime ? { runtime: item.runtime } : {}),
      agent: item.spec,
    })
  }

  return generationDraftSchema.parse({
    version: '1.0',
    mode: 'blank-team',
    project: {
      name: blueprint.project.name,
      ...(blueprint.project.description ? { description: blueprint.project.description } : {}),
      ...(blueprint.project.category ? { category: blueprint.project.category } : {}),
    },
    ...(item.name ? { starterName: item.name } : {}),
    ...(item.runtime ? { runtime: item.runtime } : {}),
    team: item.spec,
  })
}

export function resolveDraftPreviewSpec(
  draft: GenerationDraft,
  templatesBySlug: Map<string, TemplateCatalogEntry>,
): AgentTemplateSpec | TeamTemplateSpec | undefined {
  if (draft.mode === 'blank-agent') return draft.agent
  if (draft.mode === 'blank-team') return draft.team
  const slug = draft.template?.slug
  if (!slug) return undefined
  return templatesBySlug.get(slug)?.spec
}

function normalizeStringRecord(record?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0),
  )
}

function hydrateTemplateSpec<T extends TemplateSpec>(spec: T, params: Record<string, string>): T {
  return interpolateTemplateValue(structuredClone(spec), params) as T
}

function interpolateTemplateValue(value: unknown, params: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
      const replacement = params[key]?.trim()
      return replacement || match
    })
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateTemplateValue(item, params))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, interpolateTemplateValue(entry, params)]),
    )
  }

  return value
}

function normalizeTemplateAgentPreview(spec: AgentTemplateSpec): AgentTemplateSpec {
  const hasMemorySchema = Boolean(spec.memory_schema?.length)
  return {
    ...spec,
    memory_enabled: spec.memory_enabled ?? (hasMemorySchema || undefined),
    memory_strategy: spec.memory_strategy ?? (hasMemorySchema ? 'auto' : undefined),
  }
}
