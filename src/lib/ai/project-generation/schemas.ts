import { z } from 'zod'

import {
  ProjectBlueprintSchema,
  RuntimeBlueprintSchema,
} from '@contracts/project-blueprint'
import {
  AgentTemplateSpecSchema,
  ChannelHintSchema,
  EvalScenarioSchema,
  MemorySchemaHintSchema,
  ScheduleHintSchema,
  TeamMemberSpecSchema,
  TeamTemplateSpecSchema,
  TemplateSpecSchema,
  WorkGraphHintSchema,
} from '@contracts/template'
import { builderTopologyDecisionSchema } from '@/lib/agent-builder/topology/topology-schema'
import { normalizeBuilderToken } from './normalization'

export const generationModeSchema = z.enum(['template', 'blank-agent', 'blank-team'])
export type GenerationMode = z.infer<typeof generationModeSchema>

export const templateReferenceSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['agent', 'team']),
  params: z.record(z.string(), z.string()).default({}),
})

export const generationDraftSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  sourcePrompt: z.string().trim().min(1).optional(),
  mode: generationModeSchema,
  project: z.object({
    name: z.string().trim(),
    description: z.string().trim().optional(),
    category: z.string().trim().optional(),
  }),
  starterName: z.string().trim().min(1).optional(),
  runtime: RuntimeBlueprintSchema.optional(),
  template: templateReferenceSchema.optional(),
  agent: AgentTemplateSpecSchema.optional(),
  team: TeamTemplateSpecSchema.optional(),
  work_graph: WorkGraphHintSchema.optional(),
})

export type GenerationDraft = z.infer<typeof generationDraftSchema>

export const templateMatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['agent', 'team']),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  missing_params: z.array(z.string()).default([]),
})

export type TemplateMatch = z.infer<typeof templateMatchSchema>

export const missingRequiredInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  reason: z.string().min(1),
})

export type MissingRequiredInput = z.infer<typeof missingRequiredInputSchema>

export const generationPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_project_name'),
    value: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal('set_project_description'),
    value: z.string().trim(),
  }),
  z.object({
    op: z.literal('set_runtime_mode'),
    mode: RuntimeBlueprintSchema.shape.mode,
    engine: z.string().trim().optional(),
    provider: z.string().trim().optional(),
  }),
  z.object({
    op: z.literal('replace_template'),
    template: templateReferenceSchema.extend({
      params: z.record(z.string(), z.string()).default({}),
    }),
  }),
  z.object({
    op: z.literal('set_template_param'),
    key: z.string().min(1),
    value: z.string(),
  }),
  z.object({
    op: z.literal('update_agent_prompt'),
    system_prompt: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal('update_agent_spec'),
    spec: AgentTemplateSpecSchema,
  }),
  z.object({
    op: z.literal('set_starter_name'),
    value: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal('convert_agent_to_team'),
    objective: z.string().trim().optional(),
    members: z.array(TeamMemberSpecSchema).min(2).max(5),
    edges: TeamTemplateSpecSchema.shape.edges,
  }),
  z.object({
    op: z.literal('add_team_member'),
    member: TeamMemberSpecSchema,
  }),
  z.object({
    op: z.literal('remove_team_member'),
    role: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal('set_team_objective'),
    objective: z.string().trim(),
  }),
  z.object({
    op: z.literal('replace_team_spec'),
    spec: TeamTemplateSpecSchema,
  }),
])

export type GenerationPatchOperation = z.infer<typeof generationPatchOperationSchema>

export const generationPatchSchema = z.object({
  summary: z.string().trim().min(1),
  operations: z.array(generationPatchOperationSchema).min(1),
})

export type GenerationPatch = z.infer<typeof generationPatchSchema>

export const generationSessionStateSchema = z.object({
  status: z.enum(['idle', 'loading', 'review', 'error']).default('idle'),
  prompt: z.string().default(''),
})

export type GenerationSessionState = z.infer<typeof generationSessionStateSchema>

export const builderStageSchema = z.enum(['create-agent', 'deploy'])
export type BuilderStage = z.infer<typeof builderStageSchema>

export const builderDecisionCardSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('configuration_panel'),
    panel: z.enum(['channels', 'tasks']),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    action_label: z.string().trim().min(1),
    apply_action_label: z.string().trim().optional(),
    suggested_schedule: ScheduleHintSchema.optional(),
  }),
  z.object({
    kind: z.literal('runtime_mode'),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    options: z.array(z.object({
      id: z.enum(['shared', 'dedicated', 'byo']),
      label: z.string().trim().min(1),
      description: z.string().trim().optional(),
    })).min(1),
  }),
  z.object({
    kind: z.literal('template_param'),
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    placeholder: z.string().trim().optional(),
  }),
  z.object({
    kind: z.literal('team_mode'),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    options: z.array(z.object({
      id: z.enum(['single-agent', 'team']),
      label: z.string().trim().min(1),
      description: z.string().trim().optional(),
    })).min(1),
  }),
  z.object({
    kind: z.literal('capability_multi_select'),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    browse_action_label: z.string().trim().optional(),
    options: z.array(z.object({
      id: z.string().trim().min(1),
      slug: z.string().trim().min(1),
      item_type: z.enum(['skill', 'plugin']),
      label: z.string().trim().min(1),
      category: z.string().trim().optional(),
      description: z.string().trim().optional(),
    })).min(1),
  }),
  z.object({
    kind: z.literal('clarification_select'),
    ambiguity_class: z.enum(['focus', 'channels', 'integrations', 'schedule', 'topology', 'scope']),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    options: z.array(z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      description: z.string().trim().optional(),
      submit_message: z.string().trim().min(1),
    })).min(1),
  }),
])

export type BuilderDecisionCard = z.infer<typeof builderDecisionCardSchema>

export const capabilitySkillSummarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(['internal', 'catalog', 'org-installed']),
})

export const capabilityPluginSummarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  installed: z.boolean(),
  icon_url: z.string().url().nullable().optional(),
})

export const capabilityToolServerSummarySchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['http', 'sse']),
  url: z.string().min(1),
  source: z.enum(['plugin-catalog', 'skill-variant']),
})

export const capabilitySummarySchema = z.object({
  skills: z.array(capabilitySkillSummarySchema).default([]),
  plugins: z.array(capabilityPluginSummarySchema).default([]),
  tool_servers: z.array(capabilityToolServerSummarySchema).default([]),
})

export type CapabilitySummary = z.infer<typeof capabilitySummarySchema>

export const builderProfileHintSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  suggested_integrations: z.array(z.string()).default([]),
  follow_up_question: z.string().min(1),
})

export type BuilderProfileHint = z.infer<typeof builderProfileHintSchema>

export const builderClarificationSchema = z.object({
  needed: z.boolean(),
  level: z.enum(['medium', 'low']),
  ambiguity_class: z.enum(['focus', 'channels', 'integrations', 'schedule', 'topology', 'scope']),
  reason: z.string().trim().min(1),
  question: z.string().trim().min(1),
  options: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    submit_message: z.string().trim().min(1),
  })).min(1),
})

export type BuilderClarification = z.infer<typeof builderClarificationSchema>

export const generationIntentSchema = z.object({
  requested_domain: z.string().trim().optional(),
  requested_outcome: z.string().trim().min(1),
  likely_mode: generationModeSchema,
  required_integrations: z.array(z.string()).default([]),
  runtime_preference: RuntimeBlueprintSchema.shape.mode.optional(),
  missing_required_info: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  team_needed: z.boolean().default(false),
  reuse_template_likely: z.boolean().default(false),
})

export type GenerationIntent = z.infer<typeof generationIntentSchema>

const aiToolServerSchema = z.object({
  name: z.string(),
  protocol: z.enum(['mcp']),
  transport: z.enum(['http', 'sse']).nullable(),
  // Keep this format-free for provider structured-output compatibility.
  url: z.string(),
  description: z.string(),
})

const aiToolPermissionPolicySchema = z.object({
  type: z.enum(['always_allow', 'approval_required', 'manual_review', 'deny_all']),
  allowed_tools: z.array(z.string()),
  blocked_tools: z.array(z.string()),
})

const aiEvalScenarioSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  expected_behaviors: z.array(z.string()),
  must_not_contain: z.array(z.string()),
})

const aiRuntimeSchema = z.object({
  mode: RuntimeBlueprintSchema.shape.mode,
  engine: z.string(),
  provider: z.string(),
})

const aiTemplateParamSchema = z.object({
  key: z.string(),
  value: z.string(),
})

const aiTemplateReferenceSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['agent', 'team']),
  params: z.array(aiTemplateParamSchema),
})

const aiAgentSpecSchema = z.object({
  kind: z.literal('agent'),
  description: z.string(),
  system_prompt: z.string(),
  soul_content: z.string(),
  model_hint: z.string(),
  plugins: z.array(z.string()),
  skills: z.array(z.string()),
  tool_servers: z.array(aiToolServerSchema),
  tool_permission_policy: aiToolPermissionPolicySchema.nullable(),
  memory_enabled: z.boolean(),
  memory_strategy: z.enum(['auto', 'aggressive', 'conservative', 'off']),
  approval_required_tools: z.array(z.string()),
  cost_limit_per_run_usd: z.number().nullable(),
  cost_limit_daily_usd: z.number().nullable(),
  memory_schema: z.array(MemorySchemaHintSchema),
  default_schedules: z.array(ScheduleHintSchema),
  channel_hints: z.array(ChannelHintSchema),
  eval_pack: z.array(aiEvalScenarioSchema),
})

const aiTeamMemberSpecSchema = z.object({
  role: z.string(),
  is_coordinator: z.boolean(),
  description: z.string(),
  responsibilities: z.array(z.string()),
  system_prompt: z.string(),
  // OpenAI strict structured outputs require every object key to be required.
  // Use nullable for AI output, then drop null during normalization.
  system_prompt_mode: z.enum(['auto', 'manual']).nullable(),
  soul_content: z.string(),
  model_hint: z.string(),
  plugins: z.array(z.string()),
  skills: z.array(z.string()),
  tool_servers: z.array(aiToolServerSchema),
  tool_permission_policy: aiToolPermissionPolicySchema.nullable(),
  memory_schema: z.array(MemorySchemaHintSchema),
  default_schedules: z.array(ScheduleHintSchema),
})

const aiTeamEdgeSpecSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string(),
})

const aiTeamSpecSchema = z.object({
  kind: z.literal('team'),
  objective: z.string(),
  members: z.array(aiTeamMemberSpecSchema),
  edges: z.array(aiTeamEdgeSpecSchema),
  channel_hints: z.array(ChannelHintSchema),
  eval_pack: z.array(aiEvalScenarioSchema),
})

export const aiGenerationIntentSchema = z.object({
  requested_domain: z.string(),
  requested_outcome: z.string().min(1),
  likely_mode: generationModeSchema,
  required_integrations: z.array(z.string()),
  runtime_preference: RuntimeBlueprintSchema.shape.mode,
  missing_required_info: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  team_needed: z.boolean(),
  reuse_template_likely: z.boolean(),
})

export const aiGenerationDraftSchema = z.object({
  version: z.literal('1.0'),
  sourcePrompt: z.string(),
  mode: generationModeSchema,
  project: z.object({
    name: z.string(),
    description: z.string(),
    category: z.string(),
  }),
  starterName: z.string(),
  runtime: aiRuntimeSchema,
  template: aiTemplateReferenceSchema,
  agent: aiAgentSpecSchema,
  team: aiTeamSpecSchema,
})

const aiGenerationPatchOperationSchema = z.object({
    op: z.enum([
      'set_project_name',
      'set_project_description',
      'set_runtime_mode',
      'replace_template',
      'set_template_param',
      'update_agent_prompt',
      'update_agent_spec',
      'set_starter_name',
      'convert_agent_to_team',
      'add_team_member',
      'remove_team_member',
      'set_team_objective',
      'replace_team_spec',
    ]),
  value: z.string(),
  mode: RuntimeBlueprintSchema.shape.mode,
  engine: z.string(),
  provider: z.string(),
  key: z.string(),
  system_prompt: z.string(),
  spec: z.union([aiAgentSpecSchema, aiTeamSpecSchema]),
  template: aiTemplateReferenceSchema,
  objective: z.string(),
  member: aiTeamMemberSpecSchema,
  members: z.array(aiTeamMemberSpecSchema),
  edges: z.array(aiTeamEdgeSpecSchema),
  role: z.string(),
})

export const aiGenerationPatchSchema = z.object({
  summary: z.string().trim().min(1),
  operations: z.array(aiGenerationPatchOperationSchema).min(1),
})

export function normalizeGenerationIntent(
  input: z.infer<typeof aiGenerationIntentSchema>,
): GenerationIntent {
  return generationIntentSchema.parse({
    requested_domain: input.requested_domain || undefined,
    requested_outcome: input.requested_outcome,
    likely_mode: input.likely_mode,
    required_integrations: input.required_integrations,
    runtime_preference: input.runtime_preference,
    missing_required_info: input.missing_required_info,
    confidence: input.confidence,
    team_needed: input.team_needed,
    reuse_template_likely: input.reuse_template_likely,
  })
}

export function normalizeGenerationDraft(
  input: z.infer<typeof aiGenerationDraftSchema>,
): GenerationDraft {
  const fallbackName = buildFallbackProjectName(input.sourcePrompt, input.project.name)
  const fallbackStarterName = normalizeHumanProjectName(input.starterName.trim()) || fallbackName
  const fallbackAgentPrompt = buildFallbackSystemPrompt(fallbackStarterName, input.sourcePrompt)
  const normalizedTemplateName = normalizeTemplateDisplayName(input.template.name, input.template.slug)

  return generationDraftSchema.parse({
    version: input.version,
    sourcePrompt: input.sourcePrompt || undefined,
    mode: input.mode,
    project: {
      name: fallbackName,
      description: input.project.description || undefined,
      category: input.project.category || undefined,
    },
    starterName: fallbackStarterName || undefined,
    runtime: input.runtime.mode
      ? {
          mode: input.runtime.mode,
          engine: normalizeRuntimeEngine(input.runtime.engine),
          provider: input.runtime.provider || undefined,
        }
      : undefined,
    template: input.template.slug
      ? {
          slug: input.template.slug,
          name: normalizedTemplateName,
          kind: input.template.kind,
          params: Object.fromEntries(
            input.template.params
              .filter((entry) => entry.key.trim().length > 0)
              .map((entry) => [entry.key, entry.value]),
          ),
        }
      : undefined,
    agent: input.mode === 'blank-agent' || input.agent.system_prompt.trim()
      ? {
          kind: 'agent',
          description: input.agent.description || undefined,
          system_prompt: input.agent.system_prompt.trim() || fallbackAgentPrompt,
          soul_content: input.agent.soul_content || undefined,
          model_hint: input.agent.model_hint || undefined,
          ...(input.agent.plugins.length > 0 ? { plugins: input.agent.plugins } : {}),
          ...(input.agent.skills.length > 0 ? { skills: input.agent.skills } : {}),
          ...(input.agent.tool_servers?.length ? { tool_servers: input.agent.tool_servers } : {}),
          ...(input.agent.tool_permission_policy ? { tool_permission_policy: input.agent.tool_permission_policy } : {}),
          ...(typeof input.agent.memory_enabled === 'boolean' ? { memory_enabled: input.agent.memory_enabled } : {}),
          ...(input.agent.memory_strategy ? { memory_strategy: input.agent.memory_strategy } : {}),
          ...(input.agent.approval_required_tools?.length ? { approval_required_tools: input.agent.approval_required_tools } : {}),
          ...(typeof input.agent.cost_limit_per_run_usd === 'number' ? { cost_limit_per_run_usd: input.agent.cost_limit_per_run_usd } : {}),
          ...(typeof input.agent.cost_limit_daily_usd === 'number' ? { cost_limit_daily_usd: input.agent.cost_limit_daily_usd } : {}),
          ...(input.agent.memory_schema?.length ? { memory_schema: input.agent.memory_schema } : {}),
          ...(input.agent.default_schedules?.length ? { default_schedules: input.agent.default_schedules } : {}),
          ...(input.agent.channel_hints?.length ? { channel_hints: input.agent.channel_hints } : {}),
          ...(input.agent.eval_pack?.length ? { eval_pack: input.agent.eval_pack } : {}),
        }
      : undefined,
    team: input.team.members.length > 0
      ? {
          kind: 'team',
          objective: input.team.objective || undefined,
          members: input.team.members.map((member) => ({
            role: member.role,
            is_coordinator: member.is_coordinator || undefined,
            description: member.description || undefined,
            ...(member.responsibilities?.length ? { responsibilities: member.responsibilities } : {}),
            system_prompt: member.system_prompt,
            ...(member.system_prompt_mode ? { system_prompt_mode: member.system_prompt_mode } : {}),
            soul_content: member.soul_content || undefined,
            model_hint: member.model_hint || undefined,
            ...(member.plugins.length > 0 ? { plugins: member.plugins } : {}),
            ...(member.skills.length > 0 ? { skills: member.skills } : {}),
            ...(member.tool_servers?.length ? { tool_servers: member.tool_servers } : {}),
            ...(member.tool_permission_policy ? { tool_permission_policy: member.tool_permission_policy } : {}),
            ...(member.memory_schema?.length ? { memory_schema: member.memory_schema } : {}),
            ...(member.default_schedules?.length ? { default_schedules: member.default_schedules } : {}),
          })),
          edges: input.team.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            label: edge.label || undefined,
          })),
          ...(input.team.channel_hints?.length ? { channel_hints: input.team.channel_hints } : {}),
          ...(input.team.eval_pack?.length ? { eval_pack: input.team.eval_pack } : {}),
        }
      : undefined,
  })
}

function buildFallbackProjectName(sourcePrompt: string, candidate: string): string {
  const trimmed = candidate.trim()
  if (trimmed) return normalizeHumanProjectName(trimmed)

  const prompt = sourcePrompt
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()

  const words = prompt
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => normalizeNameToken(word))

  return words.join(' ') || 'New Project'
}

function normalizeTemplateDisplayName(name: string, slug: string): string {
  const trimmed = name.trim()
  if (trimmed.length > 0) return trimmed
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => normalizeNameToken(part))
    .join(' ')
}

function normalizeHumanProjectName(value: string): string {
  const strippedLeading = value
    .trim()
    .replace(/^(create|build|start|make|launch|set\s+up)\s+/i, '')

  return strippedLeading
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => normalizeNameToken(part))
    .join(' ')
}

function normalizeNameToken(value: string): string {
  const corrected = normalizeBuilderToken(value)
  return corrected.charAt(0).toUpperCase() + corrected.slice(1)
}

function buildFallbackSystemPrompt(name: string, sourcePrompt: string): string {
  const prompt = sourcePrompt.trim() || 'Help the user with direct, structured execution inside Lucid.'
  return `You are ${name} operating inside Lucid.\n\nMission:\n${prompt}`
}

function normalizeRuntimeEngine(value: string | undefined): 'openclaw' | 'hermes' | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'openclaw' || normalized === 'hermes') return normalized
  return undefined
}

export function normalizeGenerationPatch(
  input: z.infer<typeof aiGenerationPatchSchema>,
): GenerationPatch {
  return generationPatchSchema.parse({
    summary: input.summary,
    operations: input.operations.map((operation) => {
      if (operation.op === 'set_runtime_mode') {
        return {
          op: 'set_runtime_mode' as const,
          mode: operation.mode,
          engine: normalizeRuntimeEngine(operation.engine),
          provider: operation.provider || undefined,
        }
      }

      if (operation.op === 'convert_agent_to_team') {
        return {
          op: 'convert_agent_to_team' as const,
          objective: operation.objective || undefined,
          members: operation.members.map((member) => ({
            role: member.role,
            is_coordinator: member.is_coordinator || undefined,
            description: member.description || undefined,
            ...(member.responsibilities?.length ? { responsibilities: member.responsibilities } : {}),
            system_prompt: member.system_prompt,
            ...(member.system_prompt_mode ? { system_prompt_mode: member.system_prompt_mode } : {}),
            soul_content: member.soul_content || undefined,
            model_hint: member.model_hint || undefined,
            ...(member.plugins.length > 0 ? { plugins: member.plugins } : {}),
            ...(member.skills.length > 0 ? { skills: member.skills } : {}),
            ...(member.tool_servers?.length ? { tool_servers: member.tool_servers } : {}),
            ...(member.tool_permission_policy ? { tool_permission_policy: member.tool_permission_policy } : {}),
            ...(member.memory_schema?.length ? { memory_schema: member.memory_schema } : {}),
            ...(member.default_schedules?.length ? { default_schedules: member.default_schedules } : {}),
          })),
          edges: operation.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            label: edge.label || undefined,
          })),
        }
      }

      if (operation.op === 'add_team_member') {
        const member = operation.member
        if (!member) {
          throw new Error('AI patch add_team_member operation is missing member payload')
        }

        return {
          op: 'add_team_member' as const,
          member: {
            role: member.role,
            is_coordinator: member.is_coordinator || undefined,
            description: member.description || undefined,
            ...(member.responsibilities?.length ? { responsibilities: member.responsibilities } : {}),
            system_prompt: member.system_prompt,
            ...(member.system_prompt_mode ? { system_prompt_mode: member.system_prompt_mode } : {}),
            soul_content: member.soul_content || undefined,
            model_hint: member.model_hint || undefined,
            ...(member.plugins.length > 0 ? { plugins: member.plugins } : {}),
            ...(member.skills.length > 0 ? { skills: member.skills } : {}),
            ...(member.tool_servers?.length ? { tool_servers: member.tool_servers } : {}),
            ...(member.tool_permission_policy ? { tool_permission_policy: member.tool_permission_policy } : {}),
            ...(member.memory_schema?.length ? { memory_schema: member.memory_schema } : {}),
            ...(member.default_schedules?.length ? { default_schedules: member.default_schedules } : {}),
          },
        }
      }

      if (operation.op === 'update_agent_spec') {
        const spec = operation.spec
        if (spec.kind !== 'agent') {
          throw new Error('AI patch update_agent_spec operation must include an agent spec')
        }

        return {
          op: 'update_agent_spec' as const,
          spec: {
            kind: 'agent',
            description: spec.description || undefined,
            system_prompt: spec.system_prompt,
            soul_content: spec.soul_content || undefined,
            model_hint: spec.model_hint || undefined,
            ...(spec.plugins?.length ? { plugins: spec.plugins } : {}),
            ...(spec.skills?.length ? { skills: spec.skills } : {}),
            ...(spec.tool_servers?.length ? { tool_servers: spec.tool_servers } : {}),
            ...(spec.tool_permission_policy ? { tool_permission_policy: spec.tool_permission_policy } : {}),
            ...(typeof spec.memory_enabled === 'boolean' ? { memory_enabled: spec.memory_enabled } : {}),
            ...(spec.memory_strategy ? { memory_strategy: spec.memory_strategy } : {}),
            ...(spec.approval_required_tools?.length ? { approval_required_tools: spec.approval_required_tools } : {}),
            ...(typeof spec.cost_limit_per_run_usd === 'number' ? { cost_limit_per_run_usd: spec.cost_limit_per_run_usd } : {}),
            ...(typeof spec.cost_limit_daily_usd === 'number' ? { cost_limit_daily_usd: spec.cost_limit_daily_usd } : {}),
            ...(spec.memory_schema?.length ? { memory_schema: spec.memory_schema } : {}),
            ...(spec.default_schedules?.length ? { default_schedules: spec.default_schedules } : {}),
            ...(spec.channel_hints?.length ? { channel_hints: spec.channel_hints } : {}),
            ...(spec.eval_pack?.length ? { eval_pack: spec.eval_pack } : {}),
          },
        }
      }

      if (operation.op === 'replace_team_spec') {
        const spec = operation.spec
        if (spec.kind !== 'team') {
          throw new Error('AI patch replace_team_spec operation must include a team spec')
        }

        return {
          op: 'replace_team_spec' as const,
          spec: {
            kind: 'team',
            objective: spec.objective || undefined,
            members: spec.members.map((member) => ({
              role: member.role,
              is_coordinator: member.is_coordinator || undefined,
              description: member.description || undefined,
              ...(member.responsibilities?.length ? { responsibilities: member.responsibilities } : {}),
              system_prompt: member.system_prompt,
              ...(member.system_prompt_mode ? { system_prompt_mode: member.system_prompt_mode } : {}),
              soul_content: member.soul_content || undefined,
              model_hint: member.model_hint || undefined,
              ...(member.plugins?.length ? { plugins: member.plugins } : {}),
              ...(member.skills?.length ? { skills: member.skills } : {}),
              ...(member.tool_servers?.length ? { tool_servers: member.tool_servers } : {}),
              ...(member.tool_permission_policy ? { tool_permission_policy: member.tool_permission_policy } : {}),
              ...(member.memory_schema?.length ? { memory_schema: member.memory_schema } : {}),
              ...(member.default_schedules?.length ? { default_schedules: member.default_schedules } : {}),
            })),
            edges: spec.edges.map((edge) => ({
              from: edge.from,
              to: edge.to,
              label: edge.label || undefined,
            })),
            ...(spec.channel_hints?.length ? { channel_hints: spec.channel_hints } : {}),
            ...(spec.eval_pack?.length ? { eval_pack: spec.eval_pack } : {}),
          },
        }
      }

      if (operation.op === 'replace_template') {
        return {
          op: 'replace_template' as const,
          template: {
            slug: operation.template.slug,
            name: operation.template.name,
            kind: operation.template.kind,
            params: Object.fromEntries(
              operation.template.params
                .filter((entry) => entry.key.trim().length > 0)
                .map((entry) => [entry.key, entry.value]),
            ),
          },
        }
      }

      if (operation.op === 'set_project_name') {
        return {
          op: 'set_project_name' as const,
          value: operation.value,
        }
      }

      if (operation.op === 'set_project_description') {
        return {
          op: 'set_project_description' as const,
          value: operation.value,
        }
      }

      if (operation.op === 'set_template_param') {
        return {
          op: 'set_template_param' as const,
          key: operation.key,
          value: operation.value,
        }
      }

      if (operation.op === 'update_agent_prompt') {
        return {
          op: 'update_agent_prompt' as const,
          system_prompt: operation.system_prompt,
        }
      }

      if (operation.op === 'set_starter_name') {
        return {
          op: 'set_starter_name' as const,
          value: operation.value,
        }
      }

      if (operation.op === 'remove_team_member') {
        return {
          op: 'remove_team_member' as const,
          role: operation.role,
        }
      }

      return {
        op: 'set_team_objective' as const,
        objective: operation.objective,
      }
    }),
  })
}

export const generatedBlueprintResultSchema = z.object({
  mode: generationModeSchema,
  draft: generationDraftSchema,
  patch: generationPatchSchema.optional(),
  blueprint: ProjectBlueprintSchema,
  reasoning_summary: z.string().trim().min(1),
  template_matches: z.array(templateMatchSchema).default([]),
  selected_template: templateReferenceSchema.optional(),
  preview_spec: TemplateSpecSchema.optional(),
  warnings: z.array(z.string()).default([]),
  missing_required_inputs: z.array(missingRequiredInputSchema).default([]),
  suggested_integrations: z.array(z.string()).default([]),
  capability_summary: capabilitySummarySchema.optional(),
  available_capabilities: capabilitySummarySchema.optional(),
  suggested_capabilities: capabilitySummarySchema.optional(),
  profile_hint: builderProfileHintSchema.optional(),
  clarification: builderClarificationSchema.optional(),
  topology_decision: builderTopologyDecisionSchema.optional(),
  confidence: z.number().min(0).max(1),
})

export type GeneratedBlueprintResult = z.infer<typeof generatedBlueprintResultSchema>
