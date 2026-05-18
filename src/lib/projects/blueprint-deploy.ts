import 'server-only'

import type { ProjectBlueprint, ProjectBlueprintItem } from '@contracts/project-blueprint'

import {
  createProject,
  getDefaultEnvironmentForProject,
  getPrimaryProjectForWorkspace,
  getProjectByIdForWorkspace,
} from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'
import {
  deployAgentSpec,
  deployResolvedTemplate,
  deployTeamSpec,
  type TemplateDeploymentScope,
} from '@/lib/templates/deploy'
import { getDeployableTemplateCatalogEntry } from '@/lib/templates/library-server'
import { resolveBlueprintRuntime } from '@/lib/projects/blueprint-runtime'

export interface DeployProjectBlueprintOptions {
  projectId?: string
  createProject?: boolean
  runtimeId?: string
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}

export interface DeployProjectBlueprintResult {
  projectId: string
  projectSlug: string
  envId: string
  assistants: string[]
  crews: string[]
  primary:
    | { kind: 'agent'; assistantId: string | null }
    | { kind: 'team'; crewId: string | null; assistantIds: string[] }
}

async function resolveBlueprintScope(
  blueprint: ProjectBlueprint,
  orgId: string,
  userId: string,
  options: DeployProjectBlueprintOptions,
): Promise<TemplateDeploymentScope & { projectSlug: string }> {
  if (options.projectId) {
    const project = await getProjectByIdForWorkspace(orgId, options.projectId)
    if (!project) {
      throw new Error(`Project not found: ${options.projectId}`)
    }

    const env = await getDefaultEnvironmentForProject(project.id)
    if (!env) {
      throw new Error(`Default environment not found for project ${project.id}`)
    }

    return {
      projectId: project.id,
      envId: env.id,
      projectSlug: project.slug,
    }
  }

  if (options.createProject) {
    const project = await createProject({
      orgId,
      name: blueprint.project.name,
      description: blueprint.project.description ?? null,
      createdBy: userId,
    })

    if (!project) {
      throw new Error(`Failed to create project for blueprint ${blueprint.project.name}`)
    }

    const env = await getDefaultEnvironmentForProject(project.id)
    if (!env) {
      throw new Error(`Default environment not found for new project ${project.id}`)
    }

    return {
      projectId: project.id,
      envId: env.id,
      projectSlug: project.slug,
    }
  }

  const project = await getPrimaryProjectForWorkspace(orgId)
  if (!project) {
    throw new Error('Workspace does not have a project yet')
  }

  const env = await getDefaultEnvironmentForProject(project.id)
  if (!env) {
    throw new Error(`Default environment not found for project ${project.id}`)
  }

  return {
    projectId: project.id,
    envId: env.id,
    projectSlug: project.slug,
  }
}

async function deployBlueprintItem(
  item: ProjectBlueprintItem,
  orgId: string,
  userId: string,
  scope: TemplateDeploymentScope,
  fallbackRuntimeId?: string,
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>,
): Promise<{ assistantIds: string[]; crewId?: string }> {
  const runtime = item.kind === 'agent' || item.kind === 'team'
    ? resolveBlueprintRuntime(item.runtime, fallbackRuntimeId)
    : {}

  if (item.source === 'template') {
    const template = await getDeployableTemplateCatalogEntry({ idOrSlug: item.template_slug, orgId })
    if (!template) {
      throw new Error(`Template not found: ${item.template_slug}`)
    }

    const result = await deployResolvedTemplate(template, orgId, userId, item.params ?? {}, {
      nameOverride: item.name,
      scope,
      ...runtime,
      selectedConnectionIdsByProvider: item.kind === 'agent' || item.kind === 'team'
        ? selectedConnectionIdsByProvider
        : undefined,
    })

    if (result.kind === 'agent') {
      return { assistantIds: result.assistant_id ? [result.assistant_id] : [] }
    }

    return {
      assistantIds: result.assistant_ids ?? [],
      crewId: result.crew_id,
    }
  }

  if (item.kind === 'agent') {
    const assistantId = await deployAgentSpec(item.spec, {}, orgId, userId, {
      nameOverride: item.name,
      scope,
      ...runtime,
      selectedConnectionIdsByProvider,
    })

    return { assistantIds: [assistantId] }
  }

  const result = await deployTeamSpec(item.spec, {}, orgId, userId, {
    nameOverride: item.name,
    scope,
    ...runtime,
    selectedConnectionIdsByProvider,
  })

  return {
    assistantIds: result.assistantIds,
    crewId: result.crewId,
  }
}

export async function deployProjectBlueprint(
  blueprint: ProjectBlueprint,
  orgId: string,
  userId: string,
  options: DeployProjectBlueprintOptions = {},
): Promise<DeployProjectBlueprintResult> {
  const scope = await resolveBlueprintScope(blueprint, orgId, userId, options)
  const assistants: string[] = []
  const crews: string[] = []
  let primary: DeployProjectBlueprintResult['primary'] = {
    kind: 'agent',
    assistantId: null,
  }

  for (const [index, item] of blueprint.items.entries()) {
    try {
      const result = await deployBlueprintItem(
        item,
        orgId,
        userId,
        scope,
        item.kind === 'agent' || item.kind === 'team'
          ? (options.runtimeId ?? item.runtime?.runtime_id)
          : undefined,
        item.kind === 'agent' || item.kind === 'team'
          ? options.selectedConnectionIdsByProvider
          : undefined,
      )

      assistants.push(...result.assistantIds)
      if (result.crewId) {
        crews.push(result.crewId)
      }

      if (index === 0) {
        primary = item.kind === 'agent'
          ? { kind: 'agent', assistantId: result.assistantIds[0] ?? null }
          : {
              kind: 'team',
              crewId: result.crewId ?? null,
              assistantIds: result.assistantIds,
            }
      }
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        context: {
          fn: 'deployProjectBlueprint',
          orgId,
          projectId: scope.projectId,
          itemIndex: index,
          itemKind: item.kind,
          itemSource: item.source,
        },
        tags: {
          layer: 'projects',
          action: 'deploy_blueprint',
        },
      })
      throw error
    }
  }

  return {
    projectId: scope.projectId,
    projectSlug: scope.projectSlug,
    envId: scope.envId,
    assistants,
    crews,
    primary,
  }
}
