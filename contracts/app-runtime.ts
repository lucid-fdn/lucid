/**
 * App Runtime API Contracts
 *
 * Stable public/operator API shapes consumed by generated apps and the
 * app-runtime SDK. Framework-free.
 */

import { z } from 'zod'

export const AppRuntimeApiVersionSchema = z.literal('v1')

export const RequestMetaSchema = z.object({
  request_id: z.string(),
  app_runtime_api_version: AppRuntimeApiVersionSchema.default('v1'),
})

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  request_id: z.string(),
  retryable: z.boolean().default(false),
})

export const ApiErrorEnvelopeSchema = z.object({
  error: ApiErrorSchema,
})

export function ApiSuccessEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    meta: RequestMetaSchema.extend({
      next_cursor: z.string().nullable().optional(),
      has_more: z.boolean().optional(),
      agentops_trace_id: z.string().nullable().optional(),
    }),
  })
}

export const PublicAppCapabilitySchema = z.enum([
  'chat',
  'lead',
  'feedback',
  'status',
  'uploads',
  'public_actions',
  'paid_actions',
])

export type PublicAppCapability = z.infer<typeof PublicAppCapabilitySchema>

export const PublicActionCommerceModeSchema = z.enum(['off', 'shadow', 'enforce'])

export const PublicActionCommerceAmountSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(12).transform((value) => value.toLowerCase()),
})

export type PublicActionCommerceAmount = z.infer<typeof PublicActionCommerceAmountSchema>

export const PublicActionCommerceConfigSchema = z.object({
  mode: PublicActionCommerceModeSchema.default('off'),
  amount: PublicActionCommerceAmountSchema.optional(),
  provider: z.string().min(1).max(120).optional(),
  rail: z.string().min(1).max(120).optional(),
  resource_type: z.enum(['generated_app_action', 'generated_app_api', 'mcp_resource']).default('generated_app_action'),
  resource_id: z.string().min(1).max(240).optional(),
  label: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  free_quota_per_session: z.number().int().nonnegative().max(1_000).optional(),
  refund_policy: z.enum(['none', 'manual_review', 'provider_supported']).default('manual_review'),
}).superRefine((value, ctx) => {
  if (value.mode === 'enforce' && !value.amount) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount'],
      message: 'amount is required when public action commerce mode is enforce',
    })
  }
})

export type PublicActionCommerceConfig = z.infer<typeof PublicActionCommerceConfigSchema>

export const PublicAppCommerceSchema = z.object({
  paid_actions: z.record(z.string().min(1).max(80), PublicActionCommerceConfigSchema).default({}),
}).default({ paid_actions: {} })

export type PublicAppCommerce = z.infer<typeof PublicAppCommerceSchema>

export const OperatorAppCapabilitySchema = z.enum([
  'app:read',
  'app:update',
  'app:pause',
  'app:deploy',
  'agent:control',
  'agent:guardrails',
  'agent:memory',
  'team:run',
  'workflow:execute',
  'workflow:schedule',
  'approval:resolve',
  'integration:manage',
  'agentops:read',
  'agentops:remediate',
  'billing:read',
  'billing:manage',
  'marketplace:publish',
])

export const PublicAppConfigSchema = z.object({
  app_id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['active', 'paused', 'maintenance', 'setup_required']),
  visibility: z.enum(['unlisted', 'public']),
  capabilities: z.array(PublicAppCapabilitySchema),
  theme: z.record(z.string(), z.unknown()).default({}),
  public_endpoints: z.record(z.string(), z.string()).default({}),
  commerce: PublicAppCommerceSchema,
  consent: z.object({
    privacy_url: z.string().url().optional(),
    terms_url: z.string().url().optional(),
    transcript_retention_days: z.number().int().nonnegative().optional(),
  }).default({}),
})

export type PublicAppConfig = z.infer<typeof PublicAppConfigSchema>

export const VisitorSessionCreateRequestSchema = z.object({
  external_session_id: z.string().min(1).max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const VisitorSessionSchema = z.object({
  id: z.string().uuid(),
  external_session_id: z.string(),
  expires_at: z.string(),
})

export type VisitorSession = z.infer<typeof VisitorSessionSchema>

export const PublicChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(20_000),
})

export const PublicChatRequestSchema = z.object({
  visitor_session_id: z.string().uuid().optional(),
  messages: z.array(PublicChatMessageSchema).min(1).max(50),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const PublicChatAcceptedSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  agentops_trace_id: z.string(),
  status: z.enum(['accepted', 'streaming', 'queued']),
})

export const PublicChatResponseSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  agentops_trace_id: z.string(),
  status: z.enum(['completed', 'accepted', 'streaming', 'queued', 'setup_required']),
  message: PublicChatMessageSchema.optional(),
})

export type PublicChatResponse = z.infer<typeof PublicChatResponseSchema>

export const PublicLeadRequestSchema = z.object({
  visitor_session_id: z.string().uuid().optional(),
  name: z.string().max(160).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(80).optional(),
  company: z.string().max(160).optional(),
  message: z.string().max(5_000).optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
})

export const PublicLeadSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['received', 'routed', 'requires_setup']),
})

export type PublicLead = z.infer<typeof PublicLeadSchema>

export const PublicFeedbackRequestSchema = z.object({
  visitor_session_id: z.string().uuid().optional(),
  agentops_trace_id: z.string().optional(),
  rating: z.enum(['up', 'down']).optional(),
  report_type: z.enum(['unsafe', 'incorrect', 'unhelpful', 'other']).optional(),
  comment: z.string().max(2_000).optional(),
})

export const PublicActionRequestSchema = z.object({
  visitor_session_id: z.string().uuid().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  idempotency_key: z.string().max(160).optional(),
})

export const PublicActionResultSchema = z.object({
  action: z.string(),
  status: z.enum(['accepted', 'completed', 'queued', 'setup_required']),
  run_id: z.string().uuid().optional(),
  result: z.unknown().optional(),
  commerce: z.object({
    required: z.boolean(),
    status: z.enum(['not_required', 'shadow', 'proof_claimed']),
    provider: z.string().max(120).optional(),
    rail: z.string().max(120).optional(),
    challenge_id: z.string().uuid().optional(),
    resource_type: z.string().max(80).optional(),
    resource_id: z.string().max(240).optional(),
  }).optional(),
})

export type PublicActionResult = z.infer<typeof PublicActionResultSchema>

export const OperatorSessionSchema = z.object({
  token: z.string(),
  expires_at: z.string(),
  capabilities: z.array(OperatorAppCapabilitySchema),
})

export const OperatorMeSchema = z.object({
  user_id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  app_deployment_id: z.string(),
  role: z.string(),
  capabilities: z.array(OperatorAppCapabilitySchema),
  plan: z.string().nullable(),
})

export const OperatorUsageMetricSchema = z.object({
  bucket_start: z.string(),
  current: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
  percent: z.number().int().min(0).max(100).nullable(),
})

export const OperatorUsageSchema = z.object({
  daily_public_requests: OperatorUsageMetricSchema,
  monthly_chat_cost_cents: OperatorUsageMetricSchema,
  monthly_chat_completions: z.object({
    bucket_start: z.string(),
    current: z.number().int().nonnegative(),
  }),
})

export type OperatorUsage = z.infer<typeof OperatorUsageSchema>

export const OperatorAbuseMetricSchema = z.object({
  current_24h: z.number().int().nonnegative(),
  last_event_at: z.string().nullable(),
})

export const OperatorAbuseSummarySchema = z.object({
  status: z.enum(['clear', 'watch', 'blocked']),
  window_start: z.string(),
  denied_origins_24h: OperatorAbuseMetricSchema,
  rate_limited_24h: OperatorAbuseMetricSchema,
  cost_cap_hits_24h: OperatorAbuseMetricSchema,
  unsafe_feedback_24h: OperatorAbuseMetricSchema,
  blocked_public_runtime_24h: z.number().int().nonnegative(),
  recommended_actions: z.array(z.string()),
})

export type OperatorAbuseSummary = z.infer<typeof OperatorAbuseSummarySchema>

export const OperatorLaunchReadinessIssueSchema = z.object({
  code: z.string(),
  label: z.string(),
  detail: z.string(),
})

export const OperatorLaunchReadinessSchema = z.object({
  status: z.enum(['ready', 'warning', 'blocked']),
  blockers: z.array(OperatorLaunchReadinessIssueSchema),
  warnings: z.array(OperatorLaunchReadinessIssueSchema),
})

export type OperatorLaunchReadiness = z.infer<typeof OperatorLaunchReadinessSchema>

export const OperatorSummarySchema = z.object({
  app: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    visibility: z.string(),
  }),
  setup: z.object({
    complete: z.boolean(),
    missing_integrations: z.array(z.string()),
    required_actions: z.array(z.string()),
  }),
  metrics: z.object({
    public_visits_24h: z.number().default(0),
    conversations_24h: z.number().default(0),
    leads_24h: z.number().default(0),
    cost_today_usd: z.number().default(0),
    public_requests_today: z.number().int().nonnegative().default(0),
    public_request_limit: z.number().int().nonnegative().nullable().default(null),
    public_chat_cost_cents_month: z.number().int().nonnegative().default(0),
    public_chat_cost_limit_cents: z.number().int().nonnegative().nullable().default(null),
    public_chat_completions_month: z.number().int().nonnegative().default(0),
  }),
  health: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
    active_incidents: z.number().default(0),
  }),
  launch_readiness: OperatorLaunchReadinessSchema.optional(),
  abuse: OperatorAbuseSummarySchema.optional(),
})

export type OperatorSummary = z.infer<typeof OperatorSummarySchema>

export const OperatorAppSettingsPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  theme: z.object({
    mode: z.enum(['light', 'dark', 'system']).optional(),
    primary_color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    accent_color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    font_family: z.string().trim().min(1).max(80).optional(),
    radius: z.enum(['none', 'sm', 'md']).optional(),
  }).partial().optional(),
  limits: z.object({
    public_requests_per_day: z.number().int().positive().max(1_000_000).optional(),
    chat_turns_per_session: z.number().int().positive().max(1_000).optional(),
    max_upload_mb: z.number().int().positive().max(1_000).optional(),
    monthly_cost_cents: z.number().int().nonnegative().max(100_000_000).optional(),
  }).partial().optional(),
  consent: z.object({
    privacy_url: z.string().url().optional(),
    terms_url: z.string().url().optional(),
    transcript_retention_days: z.number().int().nonnegative().max(3650).optional(),
  }).partial().optional(),
  commerce: z.object({
    paid_actions: z.record(z.string().min(1).max(80), PublicActionCommerceConfigSchema).default({}),
  }).partial().optional(),
})

export type OperatorAppSettingsPatch = z.infer<typeof OperatorAppSettingsPatchSchema>

export const OperatorLifecycleRequestSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
})

export const OperatorResumeRequestSchema = OperatorLifecycleRequestSchema.extend({
  status: z.enum(['preview', 'active']).optional(),
})

export type OperatorLifecycleRequest = z.infer<typeof OperatorLifecycleRequestSchema>
export type OperatorResumeRequest = z.infer<typeof OperatorResumeRequestSchema>

export const AgentControlActionSchema = z.enum([
  'pause',
  'resume',
  'kill',
  'escalate',
  'nudge',
])

export const AgentControlRequestSchema = z.object({
  action: AgentControlActionSchema,
  message: z.string().max(2_000).optional(),
})

export const ApprovalActionRequestSchema = z.object({
  action: z.enum(['approved', 'denied']),
  reason: z.string().max(1_000).optional(),
})

export const RuntimeGatewayErrorCodes = [
  'feature_disabled',
  'kill_switch_active',
  'unauthorized',
  'forbidden',
  'not_found',
  'validation_failed',
  'rate_limited',
  'origin_not_allowed',
  'token_revoked',
  'app_paused',
  'setup_required',
  'cost_cap_reached',
  'provider_unavailable',
  'internal_error',
] as const

export type RuntimeGatewayErrorCode = (typeof RuntimeGatewayErrorCodes)[number]
