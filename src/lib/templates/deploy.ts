/**
 * Template Deploy Engine (Server-only)
 *
 * Renders a template spec, creates the resulting agent(s) / crew,
 * installs and activates plugins and skills, records the deployment,
 * and returns a structured result.
 *
 * Entry points:
 *   deployAgentTemplate — creates a single assistant from an AgentTemplateSpec
 *   deployTeamTemplate  — creates N assistants + a crew from a TeamTemplateSpec
 *   deployResolvedTemplate — materializes a Pack-provided deploy-compatible spec
 */

import 'server-only'

import {
  activatePlugin,
  createAssistant,
  deleteAssistant,
  ensurePluginInstallation,
} from '@/lib/db'
import { getDefaultEnvironmentForProject, getPrimaryProjectForWorkspace } from '@/lib/db/projects'
import { createCrew } from '@/lib/db/crews'
import { supabase } from '@/lib/db/client'
import {
  ensureSkillActivation,
  ensureSkillInstallation,
  getSkillBySlug,
} from '@/lib/db/skills'
import { ErrorService } from '@/lib/errors/error-service'
import { ensureAssistantAppBindingsForPlugins } from '@/lib/capabilities/agent-app-bindings'
import { resolveAgentModel } from '@/lib/agents/model-resolution'
import type {
  AgentTemplateSpec,
  AgentOpsWorkflowHint,
  ChannelHint,
  DeployTemplateResult,
  MemorySchemaHint,
  ScheduleHint,
  TemplateCatalogEntry,
  TemplateParam,
  TeamTemplateSpec,
} from '@contracts/template'
import { createRoutine } from '@/lib/routines/service'
import { renderTemplate } from './render'
import { normalizeTeamSystemPrompts } from '@/lib/ai/project-generation/team-member-prompt'
import type { AgentEngine, RuntimeFlavor } from '@/lib/engines/types'

const MAX_PARAM_VALUE_LENGTH = 1000
interface DeploymentResources {
  assistantIds: string[]
  crewId?: string
}

export interface TemplateDeploymentScope {
  projectId: string
  envId: string
  projectSlug: string
}

type TemplateDeploymentScopeHint =
  | TemplateDeploymentScope
  | {
      projectId: string
      envId?: string
      projectSlug?: string
    }

interface DeployAgentSpecOptions {
  nameOverride?: string
  templateSlug?: string
  scope?: TemplateDeploymentScopeHint
  runtimeId?: string
  runtimeFlavor?: RuntimeFlavor
  engine?: AgentEngine
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}

interface DeployTeamSpecOptions {
  nameOverride?: string
  templateSlug?: string
  scope?: TemplateDeploymentScopeHint
  runtimeId?: string
  runtimeFlavor?: RuntimeFlavor
  engine?: AgentEngine
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}

interface DeployResolvedTemplateOptions {
  nameOverride?: string
  scope?: TemplateDeploymentScopeHint
  runtimeId?: string
  runtimeFlavor?: RuntimeFlavor
  engine?: AgentEngine
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}

function buildDeploymentFailure(message: string, causes: string[]): Error {
  return new Error(`${message}: ${causes.join('; ')}`)
}

async function resolveDeploymentScope(
  orgId: string,
  userId: string,
  scope?: TemplateDeploymentScopeHint,
): Promise<TemplateDeploymentScope> {
  if (
    scope?.projectId
    && typeof scope.envId === 'string'
    && typeof scope.projectSlug === 'string'
  ) {
    return {
      projectId: scope.projectId,
      envId: scope.envId,
      projectSlug: scope.projectSlug,
    }
  }

  if (scope?.projectId && typeof scope.envId === 'string') {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('slug')
      .eq('id', scope.projectId)
      .single()

    if (projectError || !project?.slug) {
      throw new Error(`Cannot deploy template: project ${scope.projectId} is missing its slug`)
    }

    return {
      projectId: scope.projectId,
      envId: scope.envId,
      projectSlug: project.slug,
    }
  }

  if (scope?.projectId) {
    const [{ data: project, error: projectError }, env] = await Promise.all([
      supabase
        .from('projects')
        .select('slug')
        .eq('id', scope.projectId)
        .single(),
      getDefaultEnvironmentForProject(scope.projectId),
    ])

    if (projectError || !project?.slug) {
      throw new Error(`Cannot deploy template: project ${scope.projectId} is missing its slug`)
    }

    if (!env) {
      throw new Error(`Cannot deploy template: project ${scope.projectId} is missing its default environment`)
    }

    return {
      projectId: scope.projectId,
      envId: env.id,
      projectSlug: project.slug,
    }
  }

  const project = await getPrimaryProjectForWorkspace(orgId)
  if (!project) {
    throw new Error('Cannot deploy template: workspace does not have a project yet')
  }

  const env = await getDefaultEnvironmentForProject(project.id)
  if (!env) {
    throw new Error(`Cannot deploy template: project ${project.id} is missing its default environment`)
  }

  return {
    projectId: project.id,
    envId: env.id,
    projectSlug: project.slug,
  }
}

async function installAndActivatePlugins(
  pluginSlugs: string[],
  orgId: string,
  assistantId: string,
  userId: string,
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>,
): Promise<void> {
  const results = await Promise.allSettled(
    pluginSlugs.map(async (slug) => {
      const installationId = await ensurePluginInstallation(orgId, slug, userId)
      if (!installationId) {
        return
      }

      const activation = await activatePlugin(assistantId, installationId)
      if (!activation?.id) {
        throw new Error(`Plugin activation failed for slug "${slug}"`)
      }
    }),
  )

  const failures = results.flatMap((result) => {
    if (result.status === 'fulfilled') return []

    ErrorService.captureException(result.reason as Error, {
      severity: 'error',
      context: { fn: 'installAndActivatePlugins', orgId, assistantId },
      tags: { layer: 'templates', action: 'install_plugin' },
    })

    return [result.reason instanceof Error ? result.reason.message : 'Unknown plugin deployment failure']
  })

  if (failures.length > 0) {
    throw buildDeploymentFailure('Template plugin setup failed', failures)
  }

  await ensureAssistantAppBindingsForPlugins({
    assistantId,
    orgId,
    pluginSlugs,
    selectedConnectionIdsByProvider,
  })
}

async function installAndActivateSkills(
  skillSlugs: string[],
  orgId: string,
  assistantId: string,
  userId: string,
): Promise<void> {
  const warnings: string[] = []
  const results = await Promise.allSettled(
    skillSlugs.map(async (slug, index) => {
      const skill = await getSkillBySlug(slug, orgId)
      if (!skill) {
        warnings.push(`Skill not found: ${slug}`)
        return
      }

      const installationId = await ensureSkillInstallation(orgId, skill.id, userId)
      if (!installationId) {
        throw new Error(`Skill installation failed for slug "${slug}"`)
      }

      const activationId = await ensureSkillActivation(assistantId, installationId, index)
      if (!activationId) {
        throw new Error(`Skill activation failed for slug "${slug}"`)
      }
    }),
  )

  const failures = results.flatMap((result) => {
    if (result.status === 'fulfilled') return []

    ErrorService.captureException(result.reason as Error, {
      severity: 'error',
      context: { fn: 'installAndActivateSkills', orgId, assistantId },
      tags: { layer: 'templates', action: 'install_skill' },
    })

    return [result.reason instanceof Error ? result.reason.message : 'Unknown skill deployment failure']
  })

  if (failures.length > 0) {
    throw buildDeploymentFailure('Template skill setup failed', failures)
  }

  for (const warning of warnings) {
    ErrorService.captureException(new Error(warning), {
      severity: 'warning',
      context: { fn: 'installAndActivateSkills', orgId, assistantId },
      tags: { layer: 'templates', action: 'missing_skill', non_fatal: 'true' },
    })
  }
}

function getParamDefinitionMap(template: TemplateCatalogEntry): Map<string, TemplateParam> {
  return new Map((template.params ?? []).map((param) => [param.key, param]))
}

function resolveTemplateParams(
  template: TemplateCatalogEntry,
  params: Record<string, string>,
): Record<string, string> {
  const paramDefinitions = getParamDefinitionMap(template)
  const missingRequired = [...paramDefinitions.values()]
    .filter((param) => param.required && !(param.key in params) && param.default == null)
    .map((param) => param.key)

  if (missingRequired.length > 0) {
    throw new Error(`Missing required template params: ${missingRequired.join(', ')}`)
  }

  const resolvedParams: Record<string, string> = {}

  for (const [key, value] of Object.entries(params)) {
    if (!paramDefinitions.has(key)) {
      throw new Error(`Unknown template param: ${key}`)
    }
    if (value.length > MAX_PARAM_VALUE_LENGTH) {
      throw new Error(`Template param "${key}" exceeds ${MAX_PARAM_VALUE_LENGTH} characters`)
    }

    resolvedParams[key] = value
  }

  for (const param of paramDefinitions.values()) {
    if (!(param.key in resolvedParams) && param.default != null) {
      resolvedParams[param.key] = param.default
    }
  }

  return resolvedParams
}

async function updateAssistantTemplateFields(
  assistantId: string,
  patchFields: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(patchFields).length === 0) {
    return
  }

  const { error } = await supabase
    .from('ai_assistants')
    .update({ ...patchFields, updated_at: new Date().toISOString() })
    .eq('id', assistantId)

  if (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { fn: 'updateAssistantTemplateFields', assistantId, ...context, patchFields },
      tags: { layer: 'templates', action: 'patch_assistant' },
    })
    throw error
  }
}

async function mergeAssistantMetadata(
  assistantId: string,
  metadataPatch: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(metadataPatch).length === 0) {
    return
  }

  const { data, error: fetchError } = await supabase
    .from('ai_assistants')
    .select('metadata')
    .eq('id', assistantId)
    .single()

  if (fetchError) {
    if (isMissingTemplateMetadataColumn(fetchError)) return

    ErrorService.captureException(fetchError as Error, {
      severity: 'error',
      context: { fn: 'mergeAssistantMetadata', assistantId, ...context },
      tags: { layer: 'templates', action: 'patch_assistant_metadata' },
    })
    throw fetchError
  }

  const existingMetadata = (data?.metadata as Record<string, unknown> | null) ?? {}
  const { error } = await supabase
    .from('ai_assistants')
    .update({
      metadata: { ...existingMetadata, ...metadataPatch },
      updated_at: new Date().toISOString(),
    })
    .eq('id', assistantId)

  if (error) {
    if (isMissingTemplateMetadataColumn(error)) return

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { fn: 'mergeAssistantMetadata', assistantId, ...context, metadataPatch },
      tags: { layer: 'templates', action: 'patch_assistant_metadata' },
    })
    throw error
  }
}

async function rollbackDeploymentResources(resources: DeploymentResources): Promise<void> {
  const cleanupTasks: Promise<unknown>[] = []

  if (resources.crewId) {
    cleanupTasks.push((async () => {
      const { error } = await supabase.from('crews').delete().eq('id', resources.crewId as string)
      if (error) throw error
    })())
  }

  for (const assistantId of resources.assistantIds) {
    cleanupTasks.push(deleteAssistant(assistantId))
  }

  const cleanupResults = await Promise.allSettled(cleanupTasks)
  for (const result of cleanupResults) {
    if (result.status === 'rejected') {
      ErrorService.captureException(result.reason as Error, {
        severity: 'warning',
        context: { fn: 'rollbackDeploymentResources', resources },
        tags: { layer: 'templates', action: 'rollback' },
      })
    }
  }
}

// =============================================================================
// LIVING SPEC HINTS
// =============================================================================

/**
 * Apply living spec hints to a freshly created assistant.
 * Fail-open: each hint type is applied independently via Promise.allSettled.
 * Failures are captured via ErrorService but never trigger a rollback.
 */
async function applyLivingSpecHints(
  assistantId: string,
  orgId: string,
  templateSlug: string,
  hints: {
    memorySchema?: MemorySchemaHint[]
    schedules?: ScheduleHint[]
    channelHints?: ChannelHint[]
    evalPack?: AgentTemplateSpec['eval_pack'] | TeamTemplateSpec['eval_pack']
    opsWorkflows?: AgentOpsWorkflowHint[]
  },
): Promise<void> {
  const tasks: Promise<void>[] = []

  // 1. memory_schema → memory_config column on ai_assistants
  if (hints.memorySchema?.length) {
    tasks.push(
      updateAssistantTemplateFields(
        assistantId,
        { memory_config: hints.memorySchema },
        { fn: 'applyLivingSpecHints.memory_config', orgId, templateSlug },
      ).catch((err: Error) => {
        ErrorService.captureException(err, {
          severity: 'warning',
          context: { fn: 'applyLivingSpecHints', action: 'memory_config', assistantId, templateSlug },
          tags: { layer: 'templates', action: 'living_spec_hints' },
        })
      }),
    )
  }

  // 2. Metadata-only hints are merged in a single read-modify-write to avoid
  // racing independent metadata updates during deployment.
  const metadataPatch: Record<string, unknown> = {}
  if (hints.channelHints?.length) {
    metadataPatch.template_channel_hints = hints.channelHints
  }
  if (hints.evalPack?.length) {
    metadataPatch.template_eval_pack = hints.evalPack
  }
  if (hints.opsWorkflows?.length) {
    metadataPatch.template_ops_workflows = hints.opsWorkflows
  }
  if (Object.keys(metadataPatch).length > 0) {
    tasks.push(
      mergeAssistantMetadata(
        assistantId,
        metadataPatch,
        { fn: 'applyLivingSpecHints.metadata', orgId, templateSlug },
      ).catch((err: Error) => {
        ErrorService.captureException(err, {
          severity: 'warning',
          context: { fn: 'applyLivingSpecHints', action: 'metadata_hints', assistantId, templateSlug },
          tags: { layer: 'templates', action: 'living_spec_hints' },
        })
      }),
    )
  }

  // 3. default_schedules → agent_scheduled_tasks (non-optional only)
  const nonOptionalSchedules = (hints.schedules ?? []).filter((s) => !s.optional)
  if (nonOptionalSchedules.length > 0) {
    tasks.push(
      applyScheduleHints(assistantId, orgId, templateSlug, nonOptionalSchedules).catch((err: Error) => {
        ErrorService.captureException(err, {
          severity: 'warning',
          context: { fn: 'applyLivingSpecHints', action: 'schedules', assistantId, templateSlug },
          tags: { layer: 'templates', action: 'living_spec_hints' },
        })
      }),
    )
  }

  await Promise.allSettled(tasks)
}

async function applyScheduleHints(
  assistantId: string,
  orgId: string,
  templateSlug: string,
  schedules: ScheduleHint[],
): Promise<void> {
  await Promise.all(schedules.map((schedule, index) => createRoutine({
    assistant_id: assistantId,
    org_id: orgId,
    name: schedule.description,
    description: schedule.description,
    task_prompt: schedule.prompt,
    cron_expression: schedule.cron,
    timezone: 'UTC',
    task_kind: 'assistant_run',
    target_type: 'assistant',
    target_id: assistantId,
    trigger_kind: 'cron',
    trigger_config: { cron_expression: schedule.cron, template_slug: templateSlug },
    concurrency_policy: 'skip_if_running',
    catch_up_policy: 'latest_only',
    catch_up_limit: 1,
    runtime_selector: { nativeScheduler: 'disabled' },
    capability_requirements: [{ id: 'assistant.run', required: true }],
    source_kind: 'template',
    idempotency_key: `template-schedule-${templateSlug}-${index}`,
  }).catch((error: Error) => {
    if (isMissingScheduleIdempotencyConstraint(error)) return null
    throw error
  })))
}

function isMissingTemplateMetadataColumn(error: { code?: string | null; message?: string | null } | null): boolean {
  return Boolean(
    (error?.code === '42703' || error?.code === 'PGRST204') &&
    /ai_assistants\.metadata|metadata/i.test(error?.message ?? ''),
  )
}

function isMissingScheduleIdempotencyConstraint(error: { message?: string | null } | null): boolean {
  return /no unique or exclusion constraint matching the on conflict specification/i.test(error?.message ?? '')
}

export async function deployAgentSpec(
  spec: AgentTemplateSpec,
  params: Record<string, string>,
  orgId: string,
  userId: string,
  options: DeployAgentSpecOptions = {},
): Promise<string> {
  const rendered = renderTemplate(spec, params) as AgentTemplateSpec

  const scope = await resolveDeploymentScope(orgId, userId, options.scope)

  const assistantName =
    options.nameOverride ??
    (params.COMPANY_NAME ? `${params.COMPANY_NAME} Agent` : 'Template Agent')

  let assistantId: string | null = null

  try {
    const assistant = await createAssistant({
      orgId,
      projectId: scope.projectId,
      envId: scope.envId,
      name: assistantName,
      systemPrompt: rendered.system_prompt,
      lucidModel: resolveAgentModel(rendered.model_hint),
      memoryEnabled: rendered.memory_enabled ?? true,
      runtimeId: options.runtimeId,
      runtimeFlavor: options.runtimeFlavor,
      engine: options.engine,
    })
    assistantId = assistant.id

    const patchFields: Record<string, unknown> = {}
    if (rendered.description) patchFields.description = rendered.description
    if (rendered.soul_content) patchFields.soul_content = rendered.soul_content
    if (rendered.memory_strategy) patchFields.memory_strategy = rendered.memory_strategy
    if (rendered.tool_permission_policy) patchFields.policy_config = rendered.tool_permission_policy
    if (rendered.approval_required_tools?.length) {
      patchFields.approval_required_tools = rendered.approval_required_tools
    }
    if (rendered.cost_limit_per_run_usd != null) {
      patchFields.cost_limit_per_run_usd = rendered.cost_limit_per_run_usd
    }
    if (rendered.cost_limit_daily_usd != null) {
      patchFields.cost_limit_daily_usd = rendered.cost_limit_daily_usd
    }

    await updateAssistantTemplateFields(assistant.id, patchFields, {
      fn: 'deployAgentTemplate',
      orgId,
      userId,
    })

    if (rendered.tool_servers?.length) {
      await mergeAssistantMetadata(
        assistant.id,
        { template_tool_servers: rendered.tool_servers },
        { fn: 'deployAgentTemplate', orgId, userId },
      )
    }

    // Apply living spec hints (fail-open — never triggers rollback)
    await applyLivingSpecHints(assistant.id, orgId, options.templateSlug ?? 'agent', {
      memorySchema: rendered.memory_schema,
      schedules: rendered.default_schedules,
      channelHints: rendered.channel_hints,
      evalPack: rendered.eval_pack,
      opsWorkflows: rendered.ops_workflows,
    })

    await Promise.all([
      rendered.plugins?.length
        ? installAndActivatePlugins(
            rendered.plugins,
            orgId,
            assistant.id,
            userId,
            options.selectedConnectionIdsByProvider,
          )
        : Promise.resolve(),
      rendered.skills?.length
        ? installAndActivateSkills(rendered.skills, orgId, assistant.id, userId)
        : Promise.resolve(),
    ])

    return assistant.id
  } catch (error) {
    if (assistantId) {
      await rollbackDeploymentResources({ assistantIds: [assistantId] })
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to deploy agent template')
  }
}

export async function deployAgentTemplate(
  spec: AgentTemplateSpec,
  params: Record<string, string>,
  orgId: string,
  userId: string,
  nameOverride?: string,
  templateSlug?: string,
): Promise<string> {
  return deployAgentSpec(spec, params, orgId, userId, {
    nameOverride,
    templateSlug,
  })
}

export async function deployTeamSpec(
  spec: TeamTemplateSpec,
  params: Record<string, string>,
  orgId: string,
  userId: string,
  options: DeployTeamSpecOptions = {},
): Promise<{ crewId: string; assistantIds: string[] }> {
  const rendered = normalizeTeamSystemPrompts(renderTemplate(spec, params) as TeamTemplateSpec)

  const scope = await resolveDeploymentScope(orgId, userId, options.scope)

  const roleToAssistantId: Record<string, string> = {}
  const assistantIds: string[] = []

  try {
    for (const member of rendered.members) {
      const assistant = await createAssistant({
        orgId,
        projectId: scope.projectId,
        envId: scope.envId,
        name: member.role,
        systemPrompt: member.system_prompt,
        lucidModel: resolveAgentModel(member.model_hint),
        memoryEnabled: true,
        runtimeId: options.runtimeId,
        runtimeFlavor: options.runtimeFlavor,
        engine: options.engine,
      })

      await updateAssistantTemplateFields(
        assistant.id,
        {
          ...(member.description ? { description: member.description } : {}),
          ...(member.soul_content ? { soul_content: member.soul_content } : {}),
          ...(member.tool_permission_policy ? { policy_config: member.tool_permission_policy } : {}),
        },
        { fn: 'deployTeamTemplate', role: member.role, orgId, userId },
      )

      if (member.tool_servers?.length) {
        await mergeAssistantMetadata(
          assistant.id,
          { template_tool_servers: member.tool_servers },
          { fn: 'deployTeamTemplate', role: member.role, orgId, userId },
        )
      }

      // Apply per-member living spec hints (fail-open)
      await applyLivingSpecHints(assistant.id, orgId, options.templateSlug ?? 'team', {
        memorySchema: member.memory_schema,
        schedules: member.default_schedules,
        // team-level channel_hints are applied to the coordinator's assistant after the loop
      })

      await Promise.all([
        member.plugins?.length
          ? installAndActivatePlugins(
              member.plugins,
              orgId,
              assistant.id,
              userId,
              options.selectedConnectionIdsByProvider,
            )
          : Promise.resolve(),
        member.skills?.length
          ? installAndActivateSkills(member.skills, orgId, assistant.id, userId)
          : Promise.resolve(),
      ])

      roleToAssistantId[member.role] = assistant.id
      assistantIds.push(assistant.id)
    }
  } catch (error) {
    await rollbackDeploymentResources({ assistantIds })
    throw error
  }

  // Apply team-level channel_hints to the coordinator's assistant (fail-open)
  if (rendered.channel_hints?.length) {
    const coordinatorRole = rendered.members.find((m) => m.is_coordinator)?.role
    const coordinatorId = coordinatorRole ? roleToAssistantId[coordinatorRole] : assistantIds[0]
    if (coordinatorId) {
      await applyLivingSpecHints(coordinatorId, orgId, options.templateSlug ?? 'team', {
        channelHints: rendered.channel_hints,
        evalPack: rendered.eval_pack,
        opsWorkflows: rendered.ops_workflows,
      }).catch((err: Error) => {
        ErrorService.captureException(err, {
          severity: 'warning',
          context: { fn: 'deployTeamTemplate', action: 'channel_hints', orgId },
          tags: { layer: 'templates', action: 'living_spec_hints' },
        })
      })
    }
  }

  const crewName = options.nameOverride ?? (params.TOPIC ? `${params.TOPIC} Team` : 'Template Team')

  const members = rendered.members.map((member) => ({
    assistant_id: roleToAssistantId[member.role] ?? '',
    role: member.role,
    is_coordinator: member.is_coordinator ?? false,
  }))

  const roleToIndex: Record<string, number> = {}
  rendered.members.forEach((member, index) => {
    roleToIndex[member.role] = index
  })

  const edges = rendered.edges
    .filter((edge) => roleToIndex[edge.from] !== undefined && roleToIndex[edge.to] !== undefined)
    .map((edge) => ({
      source_member_index: roleToIndex[edge.from] as number,
      target_member_index: roleToIndex[edge.to] as number,
      direction: 'unidirectional' as const,
      label: edge.label,
    }))

  const crewResult = await createCrew(
    orgId,
    {
      name: crewName,
      objective: rendered.objective ?? crewName,
      project_id: scope.projectId,
      members,
      edges,
    },
    userId,
  )

  if (!crewResult) {
    await rollbackDeploymentResources({ assistantIds })
    throw new Error('Failed to create crew for team template')
  }

  return { crewId: crewResult.crew.id, assistantIds }
}

export async function deployTeamTemplate(
  spec: TeamTemplateSpec,
  params: Record<string, string>,
  orgId: string,
  userId: string,
  nameOverride?: string,
  templateSlug?: string,
  options: Pick<DeployTeamSpecOptions, 'runtimeId' | 'runtimeFlavor' | 'engine' | 'selectedConnectionIdsByProvider'> = {},
): Promise<{ crewId: string; assistantIds: string[] }> {
  return deployTeamSpec(spec, params, orgId, userId, {
    nameOverride,
    templateSlug,
    runtimeId: options.runtimeId,
    runtimeFlavor: options.runtimeFlavor,
    engine: options.engine,
    selectedConnectionIdsByProvider: options.selectedConnectionIdsByProvider,
  })
}

export async function deployResolvedTemplate(
  template: TemplateCatalogEntry,
  orgId: string,
  userId: string,
  params: Record<string, string> = {},
  options: DeployResolvedTemplateOptions = {},
): Promise<DeployTemplateResult> {
  const resolvedParams = resolveTemplateParams(template, params)
  const scope = await resolveDeploymentScope(orgId, userId, options.scope)

  if (template.spec.kind === 'agent') {
    const assistantId = await deployAgentSpec(
      template.spec,
      resolvedParams,
      orgId,
      userId,
      {
        nameOverride: options.nameOverride,
        templateSlug: template.slug,
        scope,
        runtimeId: options.runtimeId,
        runtimeFlavor: options.runtimeFlavor,
        engine: options.engine,
        selectedConnectionIdsByProvider: options.selectedConnectionIdsByProvider,
      },
    )

    return {
      deployment_id: crypto.randomUUID(),
      kind: 'agent',
      project_slug: scope.projectSlug,
      assistant_id: assistantId,
    }
  }

  const { crewId, assistantIds } = await deployTeamSpec(
    template.spec,
    resolvedParams,
    orgId,
    userId,
    {
      nameOverride: options.nameOverride,
      templateSlug: template.slug,
      scope,
      runtimeId: options.runtimeId,
      runtimeFlavor: options.runtimeFlavor,
      engine: options.engine,
      selectedConnectionIdsByProvider: options.selectedConnectionIdsByProvider,
    },
  )

  return {
    deployment_id: crypto.randomUUID(),
    kind: 'team',
    project_slug: scope.projectSlug,
    crew_id: crewId,
    assistant_ids: assistantIds,
  }
}
