/**
 * App Service Foundry Contracts
 *
 * Pure TypeScript + Zod. Shared between the Next.js app, workers, and generated
 * app tooling. Keep this file framework-free.
 */

import { z } from 'zod'
import { PublicActionCommerceConfigSchema } from './app-runtime'
import {
  AgentTemplateSpecSchema,
  ChannelHintSchema,
  EvalScenarioSchema,
  TeamTemplateSpecSchema,
} from './template'

export const AppServiceSchemaVersionSchema = z.literal('1.0')

export const AppServiceCategorySchema = z.enum([
  'support',
  'sales',
  'content',
  'ops',
  'knowledge',
  'custom',
])

export type AppServiceCategory = z.infer<typeof AppServiceCategorySchema>

export const AppFrontendTargetSchema = z.enum([
  'lucid_manifest',
  'v0_vercel',
  'external_vercel',
  'docker_export',
])

export const AppRuntimeApiTargetSchema = z.enum([
  'shared_lucid_next',
])

export const AppAgentRuntimeTargetSchema = z.enum([
  'shared_worker',
  'dedicated_runtime',
  'byo_runtime',
])

export const AppGenerationRuntimeTargetSchema = z.enum([
  'shared_appgen_worker',
])

export const PUBLIC_APP_RUNTIME_OPENAPI_PATH = '/api/app-runtime/v1/sdk/openapi.json'

function isPublicAppRuntimeOpenApiLocation(value: string): boolean {
  if (value === PUBLIC_APP_RUNTIME_OPENAPI_PATH) return true

  try {
    const url = new URL(value)
    const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return url.pathname === PUBLIC_APP_RUNTIME_OPENAPI_PATH
      && (url.protocol === 'https:' || (localHost && url.protocol === 'http:'))
  } catch {
    return false
  }
}

export const AppDeploymentTargetSchema = z.enum([
  'lucid_hosted',
  'vercel',
  'netlify',
  'docker',
])

export type AppDeploymentTarget = z.infer<typeof AppDeploymentTargetSchema>

export const AppVisibilitySchema = z.enum(['private', 'unlisted', 'public'])

export const AppDeploymentStatusSchema = z.enum([
  'draft',
  'preview',
  'active',
  'paused',
  'failed',
  'archived',
])

export const AppGenerationStatusSchema = z.enum([
  'queued',
  'planning',
  'awaiting_input',
  'generating',
  'building',
  'evaluating',
  'deploying',
  'succeeded',
  'failed',
  'cancelled',
])

export type AppGenerationStatus = z.infer<typeof AppGenerationStatusSchema>

export const AppFrontendBlockTypeSchema = z.enum([
  'hero',
  'service_summary',
  'demo_chat',
  'lead_form',
  'intake_form',
  'faq',
  'proof_metrics',
  'creator_attribution',
  'pricing_cta',
  'embed_widget',
  'owner_cockpit',
  'agentops_panel',
])

export const AppFrontendBlockSchema = z.object({
  id: z.string().min(1).max(80),
  type: AppFrontendBlockTypeSchema,
  enabled: z.boolean().default(true),
  props: z.record(z.string(), z.unknown()).default({}),
})

export const AppFrontendSpecSchema = z.object({
  strategy: z.enum(['manifest', 'generated_code', 'external']).default('manifest'),
  theme: z.object({
    mode: z.enum(['light', 'dark', 'system']).default('system'),
    primary_color: z.string().optional(),
    accent_color: z.string().optional(),
    font_family: z.string().optional(),
    radius: z.enum(['none', 'sm', 'md']).default('sm'),
  }).default({ mode: 'system', radius: 'sm' }),
  pages: z.array(z.object({
    path: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    blocks: z.array(AppFrontendBlockSchema).default([]),
  })).default([]),
  required_states: z.array(z.enum([
    'loading',
    'empty',
    'error',
    'setup_required',
    'rate_limited',
    'agent_paused',
    'maintenance',
  ])).default([]),
})

export type AppFrontendSpec = z.infer<typeof AppFrontendSpecSchema>

export const AppAgentBindingSchema = z.object({
  key: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  template: AgentTemplateSpecSchema.optional(),
  template_id: z.string().uuid().optional(),
  assistant_id: z.string().uuid().optional(),
  public_chat_enabled: z.boolean().default(false),
  memory_policy: z.enum(['private', 'visitor_scoped', 'disabled']).default('private'),
})

export const AppTeamBindingSchema = z.object({
  key: z.string().min(1).max(80),
  template: TeamTemplateSpecSchema.optional(),
  template_id: z.string().uuid().optional(),
  crew_id: z.string().uuid().optional(),
  public_chat_enabled: z.boolean().default(false),
})

export const AppWorkflowBindingSchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  workflow_id: z.string().uuid().optional(),
  dag_id: z.string().uuid().optional(),
  trigger: z.enum(['manual', 'public_action', 'schedule', 'webhook', 'agent']).default('manual'),
  public_action_key: z.string().min(1).max(80).optional(),
  input_schema: z.record(z.string(), z.unknown()).optional(),
  commerce: PublicActionCommerceConfigSchema.optional(),
})

export const AppIntegrationRequirementSchema = z.object({
  provider: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  required: z.boolean().default(false),
  purpose: z.string().max(500).optional(),
  scopes: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
})

export const AppSecretRequirementSchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]{1,80}$/),
  label: z.string().min(1).max(120),
  required: z.boolean().default(false),
  target: z.enum(['lucid_server', 'generated_frontend_public', 'external_provider']),
  description: z.string().max(500).optional(),
})

export const AppRuntimeTargetsSchema = z.object({
  frontend_target: AppFrontendTargetSchema.default('lucid_manifest'),
  app_runtime_api_target: AppRuntimeApiTargetSchema.default('shared_lucid_next'),
  agent_runtime_target: AppAgentRuntimeTargetSchema.default('shared_worker'),
  generation_runtime_target: AppGenerationRuntimeTargetSchema.default('shared_appgen_worker'),
  dedicated_runtime_id: z.string().uuid().optional(),
})

const DEFAULT_APP_RUNTIME_TARGETS = {
  frontend_target: 'lucid_manifest' as const,
  app_runtime_api_target: 'shared_lucid_next' as const,
  agent_runtime_target: 'shared_worker' as const,
  generation_runtime_target: 'shared_appgen_worker' as const,
}

export const AppServiceSpecSchema = z.object({
  schema_version: AppServiceSchemaVersionSchema,
  kind: z.literal('app_service'),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(1000),
  category: AppServiceCategorySchema,
  audience: z.string().min(1).max(500),
  outcome: z.string().min(1).max(500),
  frontend: AppFrontendSpecSchema,
  agents: z.array(AppAgentBindingSchema).min(1),
  team: AppTeamBindingSchema.optional(),
  workflows: z.array(AppWorkflowBindingSchema).default([]),
  commerce: z.object({
    paid_actions: z.record(z.string().min(1).max(80), PublicActionCommerceConfigSchema).default({}),
  }).optional(),
  integrations: z.array(AppIntegrationRequirementSchema).default([]),
  secrets: z.array(AppSecretRequirementSchema).default([]),
  channels: z.array(ChannelHintSchema).default([]),
  deployment: z.object({
    default_target: AppDeploymentTargetSchema.default('lucid_hosted'),
    allowed_targets: z.array(AppDeploymentTargetSchema).default(['lucid_hosted']),
    runtime: AppRuntimeTargetsSchema.default(DEFAULT_APP_RUNTIME_TARGETS),
  }).default({
    default_target: 'lucid_hosted',
    allowed_targets: ['lucid_hosted'],
    runtime: DEFAULT_APP_RUNTIME_TARGETS,
  }),
  eval_pack: z.array(EvalScenarioSchema).default([]),
  marketplace: z.object({
    tags: z.array(z.string()).default([]),
    demo_prompts: z.array(z.string()).default([]),
    creator_attribution: z.string().optional(),
    proof_page_enabled: z.boolean().default(true),
  }).default({ tags: [], demo_prompts: [], proof_page_enabled: true }),
})

export type AppServiceSpec = z.infer<typeof AppServiceSpecSchema>

export const FrontendBuildBriefSchema = z.object({
  schema_version: AppServiceSchemaVersionSchema,
  app_name: z.string(),
  app_slug: z.string(),
  purpose: z.string(),
  audience: z.string(),
  outcome: z.string(),
  frontend: AppFrontendSpecSchema,
  public_api_contract_url: z.string()
    .min(1)
    .max(500)
    .refine(
      isPublicAppRuntimeOpenApiLocation,
      'public_api_contract_url must point at the public App Runtime SDK OpenAPI endpoint.',
    )
    .optional(),
  public_api_contract: z.record(z.string(), z.unknown()).optional(),
  sdk_package: z.string().default('@lucid/app-runtime-sdk'),
  forbidden: z.array(z.string()).default([
    'Do not request or embed Lucid provider secrets.',
    'Do not call internal Lucid APIs directly.',
    'Do not expose hidden system prompts.',
    'Do not call raw Mission Control, org, OAuth, provider-key, billing, app-services, or operator runtime routes.',
    'Use @lucid/app-runtime-sdk and /api/app-runtime/v1/public/apps/{slug} for runtime calls.',
  ]),
})

export type FrontendBuildBrief = z.infer<typeof FrontendBuildBriefSchema>

export const AppPlannerResultSchema = z.object({
  spec: AppServiceSpecSchema,
  reasoning: z.string().max(4_000),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommended_next_steps: z.array(z.string()).default([]),
})

export type AppPlannerResult = z.infer<typeof AppPlannerResultSchema>

export const AppBlueprintUpgradeMetadataSchema = z.object({
  schema_version: z.string().default('1.0'),
  channel: z.enum(['stable', 'beta', 'experimental']).default('stable'),
  compatible_from: z.array(z.string()).default([]),
  migration_steps: z.array(z.string()).default([]),
  notes: z.string().max(2_000).optional(),
}).passthrough()

export type AppBlueprintUpgradeMetadata = z.infer<typeof AppBlueprintUpgradeMetadataSchema>

export const AppBlueprintDiscoveryMetadataSchema = z.object({
  schema_version: z.string().default('1.0'),
  protocols: z.array(z.enum(['mcp', 'a2a'])).default([]),
  mcp: z.array(z.record(z.string(), z.unknown())).default([]),
  a2a: z.array(z.record(z.string(), z.unknown())).default([]),
}).passthrough()

export type AppBlueprintDiscoveryMetadata = z.infer<typeof AppBlueprintDiscoveryMetadataSchema>

export const AppBlueprintUpgradePlanStepSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  severity: z.enum(['info', 'warning', 'blocking']).default('info'),
  automatic: z.boolean().default(false),
  details: z.string().max(1_000).optional(),
})

export const AppBlueprintUpgradePlanSchema = z.object({
  schema_version: z.literal('1.0'),
  app_deployment_id: z.string(),
  status: z.enum(['not_applicable', 'available', 'blocked']),
  current: z.object({
    blueprint_id: z.string().uuid().nullable(),
    slug: z.string().nullable(),
    version: z.string().nullable(),
  }),
  target: z.object({
    blueprint_id: z.string().uuid().nullable(),
    slug: z.string(),
    version: z.string(),
    source: z.enum(['platform', 'community', 'org']),
  }),
  steps: z.array(AppBlueprintUpgradePlanStepSchema),
  blockers: z.array(AppBlueprintUpgradePlanStepSchema),
  warnings: z.array(AppBlueprintUpgradePlanStepSchema),
  spec_changes: z.object({
    capabilities_added: z.array(z.string()).default([]),
    capabilities_removed: z.array(z.string()).default([]),
    integrations_added: z.array(z.string()).default([]),
    integrations_removed: z.array(z.string()).default([]),
    workflows_added: z.array(z.string()).default([]),
    workflows_removed: z.array(z.string()).default([]),
  }),
})

export type AppBlueprintUpgradePlan = z.infer<typeof AppBlueprintUpgradePlanSchema>

export const AppBlueprintUpgradeRunSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  from_blueprint_id: z.string().uuid().nullable(),
  to_blueprint_id: z.string().uuid().nullable(),
  target_blueprint_slug: z.string(),
  from_version: z.string().nullable(),
  to_version: z.string(),
  status: z.enum(['planned', 'applied', 'blocked', 'failed']),
  plan: AppBlueprintUpgradePlanSchema,
  created_by: z.string().uuid(),
  applied_by: z.string().uuid().nullable(),
  created_at: z.string(),
  applied_at: z.string().nullable(),
})

export type AppBlueprintUpgradeRun = z.infer<typeof AppBlueprintUpgradeRunSchema>

export const AppBlueprintSchema = z.object({
  id: z.string().uuid(),
  template_id: z.string().uuid().nullable().optional(),
  org_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: AppServiceCategorySchema.or(z.string()),
  source: z.enum(['platform', 'community', 'org']),
  status: z.enum(['draft', 'pending_review', 'approved', 'deprecated']),
  visibility: AppVisibilitySchema,
  version: z.string(),
  spec: AppServiceSpecSchema,
  frontend_brief: z.record(z.string(), z.unknown()).default({}),
  upgrade_metadata: AppBlueprintUpgradeMetadataSchema.default({
    schema_version: '1.0',
    channel: 'stable',
    compatible_from: [],
    migration_steps: [],
  }),
  discovery_metadata: AppBlueprintDiscoveryMetadataSchema.default({
    schema_version: '1.0',
    protocols: [],
    mcp: [],
    a2a: [],
  }),
  tags: z.array(z.string()).default([]),
  install_count: z.number().int().nonnegative().default(0),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AppBlueprint = z.infer<typeof AppBlueprintSchema>

export const AppGenerationRunSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  environment_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid(),
  prompt: z.string(),
  status: AppGenerationStatusSchema,
  stage: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).nullable().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  generated_spec: AppServiceSpecSchema.nullable().optional(),
  selected_blueprint_id: z.string().uuid().nullable().optional(),
  app_deployment_id: z.string().uuid().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
  provider_refs: z.record(z.string(), z.unknown()).default({}),
  token_usage: z.record(z.string(), z.unknown()).default({}),
  estimated_cost_cents: z.number().int().nonnegative().default(0),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AppGenerationRun = z.infer<typeof AppGenerationRunSchema>

export const AppDeploymentSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  environment_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  blueprint_id: z.string().uuid().nullable().optional(),
  generation_run_id: z.string().uuid().nullable().optional(),
  name: z.string(),
  slug: z.string(),
  status: AppDeploymentStatusSchema,
  visibility: AppVisibilitySchema,
  frontend_strategy: z.enum(['manifest', 'generated_code', 'external']),
  frontend_manifest: z.record(z.string(), z.unknown()).default({}),
  public_url: z.string().nullable().optional(),
  preview_url: z.string().nullable().optional(),
  custom_domain: z.string().nullable().optional(),
  assistant_ids: z.array(z.string().uuid()).default([]),
  crew_id: z.string().uuid().nullable().optional(),
  dag_ids: z.array(z.string().uuid()).default([]),
  template_deployment_ids: z.array(z.string().uuid()).default([]),
  runtime_id: z.string().uuid().nullable().optional(),
  deployment_target: AppDeploymentTargetSchema,
  latest_artifact_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  deployed_at: z.string().nullable().optional(),
})

export type AppDeployment = z.infer<typeof AppDeploymentSchema>

export const AppDeploymentEventSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid().nullable().optional(),
  generation_run_id: z.string().uuid().nullable().optional(),
  event_type: z.string(),
  severity: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
  message: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
})

export type AppDeploymentEvent = z.infer<typeof AppDeploymentEventSchema>

export const AppPublicUsageBucketSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  bucket_kind: z.enum(['day', 'month']),
  metric: z.enum(['public_requests', 'public_chat_cost_cents', 'public_chat_completions']),
  bucket_start: z.string(),
  count_value: z.coerce.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AppPublicUsageBucket = z.infer<typeof AppPublicUsageBucketSchema>

export const AppPublicTokenSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid(),
  token_hash: z.string(),
  label: z.string().nullable().optional(),
  capabilities: z.array(z.string()).default([]),
  expires_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
})

export type AppPublicToken = z.infer<typeof AppPublicTokenSchema>

export const AppArtifactKindSchema = z.enum([
  'manifest',
  'source_archive',
  'build_log',
  'preview_screenshot',
  'eval_report',
  'deployment_receipt',
])

export const AppArtifactSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid().nullable().optional(),
  generation_run_id: z.string().uuid(),
  kind: AppArtifactKindSchema,
  version: z.number().int().positive(),
  storage_url: z.string().nullable().optional(),
  checksum: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
})

export type AppArtifact = z.infer<typeof AppArtifactSchema>

export const AppFrontendGenerationStatusSchema = z.enum([
  'queued',
  'generating',
  'ready',
  'failed',
  'cancelled',
])

export const AppFrontendGenerationProviderSchema = z.enum(['v0', 'mock'])

export const AppFrontendGenerationSchema = z.object({
  id: z.string().uuid(),
  generation_run_id: z.string().uuid(),
  app_deployment_id: z.string().uuid().nullable().optional(),
  provider: AppFrontendGenerationProviderSchema,
  status: AppFrontendGenerationStatusSchema,
  provider_project_id: z.string().nullable().optional(),
  provider_chat_id: z.string().nullable().optional(),
  provider_version_id: z.string().nullable().optional(),
  provider_deployment_id: z.string().nullable().optional(),
  prompt_hash: z.string().nullable().optional(),
  brief: z.record(z.string(), z.unknown()).default({}),
  result: z.record(z.string(), z.unknown()).default({}),
  preview_url: z.string().nullable().optional(),
  web_url: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AppFrontendGeneration = z.infer<typeof AppFrontendGenerationSchema>

export const AppExternalDeploymentStatusSchema = z.enum([
  'queued',
  'building',
  'ready',
  'failed',
  'cancelled',
])

export const AppExternalDeploymentProviderSchema = z.enum(['v0', 'vercel', 'netlify', 'docker'])

export const AppExternalDeploymentSchema = z.object({
  id: z.string().uuid(),
  app_deployment_id: z.string().uuid(),
  provider: AppExternalDeploymentProviderSchema,
  external_project_id: z.string().nullable().optional(),
  external_deployment_id: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  status: AppExternalDeploymentStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AppExternalDeployment = z.infer<typeof AppExternalDeploymentSchema>
