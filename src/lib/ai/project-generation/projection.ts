import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { CrewTopology } from '@contracts/crew'
import type { Agent as Assistant } from '@/types/agent'

import { createBlankAgentDraft, projectBlueprintFromDraft } from './draft'
import { generationDraftSchema, type GenerationDraft } from './schemas'

interface ProjectProjectionContext {
  projectName?: string
  projectDescription?: string
  projectCategory?: string
}

export interface TeamProjectionMember {
  assistant: Pick<Assistant, 'name' | 'description' | 'system_prompt' | 'lucid_model'>
  role: string
  isCoordinator?: boolean
}

export interface TeamProjectionInput {
  crew: Pick<CrewTopology['crew'], 'name' | 'description' | 'objective'>
  members: TeamProjectionMember[]
  edges: Array<{ from: string; to: string; label?: string | null }>
  runtime?: RuntimeBlueprint
  project?: ProjectProjectionContext
}

export function projectDraftFromAssistant(
  assistant: Pick<Assistant, 'name' | 'description' | 'system_prompt' | 'runtime_flavor' | 'engine'>,
  project: ProjectProjectionContext = {},
): GenerationDraft {
  return createBlankAgentDraft({
    projectName: project.projectName?.trim() || assistant.name,
    projectDescription: project.projectDescription?.trim() || assistant.description || undefined,
    starterName: assistant.name,
    systemPrompt: assistant.system_prompt,
    ...(project.projectCategory?.trim() ? { category: project.projectCategory.trim() } : {}),
    ...(projectRuntimeFromAssistant(assistant) ? { runtime: projectRuntimeFromAssistant(assistant) } : {}),
  })
}

export function projectDraftFromTeam(input: TeamProjectionInput): GenerationDraft {
  const coordinatorIndex = input.members.findIndex((member) => member.isCoordinator)

  return generationDraftSchema.parse({
    version: '1.0',
    mode: 'blank-team',
    project: {
      name: input.project?.projectName?.trim() || input.crew.name,
      ...(input.project?.projectDescription?.trim()
        ? { description: input.project.projectDescription.trim() }
        : input.crew.description
          ? { description: input.crew.description }
          : {}),
      ...(input.project?.projectCategory?.trim()
        ? { category: input.project.projectCategory.trim() }
        : {}),
    },
    starterName: input.crew.name,
    ...(input.runtime ? { runtime: input.runtime } : {}),
    team: {
      kind: 'team',
      objective: input.crew.objective,
      members: input.members.slice(0, 5).map((member, index) => ({
        role: member.role,
        is_coordinator: member.isCoordinator ?? index === (coordinatorIndex >= 0 ? coordinatorIndex : 0),
        system_prompt: member.assistant.system_prompt,
        ...(member.assistant.description ? { description: member.assistant.description } : {}),
        ...(member.assistant.lucid_model ? { model_hint: member.assistant.lucid_model } : {}),
      })),
      edges: input.edges
        .filter((edge) => input.members.some((member) => member.role === edge.from) && input.members.some((member) => member.role === edge.to))
        .map((edge) => ({
          from: edge.from,
          to: edge.to,
          ...(edge.label ? { label: edge.label } : {}),
        })),
    },
  })
}

export function projectBlueprintFromAssistantProjection(
  assistant: Pick<Assistant, 'name' | 'description' | 'system_prompt' | 'runtime_flavor' | 'engine'>,
  project?: ProjectProjectionContext,
) {
  return projectBlueprintFromDraft(projectDraftFromAssistant(assistant, project))
}

function projectRuntimeFromAssistant(
  assistant: Pick<Assistant, 'runtime_flavor' | 'engine'>,
): RuntimeBlueprint | undefined {
  if (!assistant.runtime_flavor || assistant.runtime_flavor === 'shared') {
    return undefined
  }

  return {
    mode: assistant.runtime_flavor === 'c2a_autonomous' ? 'byo' : 'dedicated',
    ...(assistant.engine ? { engine: assistant.engine } : {}),
  }
}
