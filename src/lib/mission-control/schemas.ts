/**
 * Mission Control — Zod Schemas
 */

import { z } from 'zod'
import { ENGINE_OPTIONS } from '@/lib/engines/registry'
import {
  RuntimeAdapterIdentitySchema,
  RuntimeAdapterProbeSummarySchema,
  RuntimeCommandSpecSchema,
  RuntimeEngineHomePolicySchema,
  RuntimeManagementCommandSchema,
  RuntimeNativeCapabilitySchema,
  RuntimeServiceDescriptorSchema,
  RuntimeTranscriptParserStatusSchema,
} from '@contracts/runtime-capability'

const engineValues = ENGINE_OPTIONS.map((entry) => entry.key) as [string, ...string[]]

export const agentEngineSchema = z.enum(engineValues)
export const runtimeFlavorSchema = z.enum(['shared', 'c1_managed', 'c2a_autonomous'])
export const channelOwnershipSchema = z.enum(['lucid_relay', 'runtime_native'])
export const dedicatedTransportModeSchema = z.enum(['relay', 'native_pulse'])
export const runtimeProtocolSchema = z.enum(['lucid-runtime-v1', 'lucid-runtime-v2'])
export const engineSupportLevelSchema = z.enum(['stable', 'experimental', 'planned', 'unsupported'])
export const runtimeMaintenanceActionSchema = z.enum(['reconcile', 'redeploy', 'restart', 'rollback', 'rehome'])
export const runtimeMaintenanceJobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed'])
export const runtimeMaintenanceChannelSchema = z.enum(['stable', 'canary', 'pinned'])
export const runtimeAutoUpdatePolicySchema = z.enum(['manual', 'patch_auto', 'security_auto', 'full_auto'])
export const runtimeMigrationSourceSchema = z.enum(['openclaw'])
export const hermesOpenClawMigrationConfigSchema = z.object({
  preset: z.enum(['full', 'user-data']).optional(),
  dryRun: z.boolean().optional(),
  overwrite: z.boolean().optional(),
  sourcePath: z.string().min(1).max(500).optional(),
  workspaceTarget: z.string().min(1).max(500).optional(),
  skillConflict: z.enum(['skip', 'overwrite', 'rename']).optional(),
})
export const runtimeMigrationConfigSchema = z.object({
  source: runtimeMigrationSourceSchema,
  hermesOpenClaw: hermesOpenClawMigrationConfigSchema.optional(),
})
export const runtimeAdvancedConfigSchema = z.object({
  network: z.object({
    access: z.enum(['limited', 'unrestricted', 'custom_allowlist']),
    allowed_hosts: z.array(z.string().min(1).max(300)).max(100),
    secrets_source: z.enum(['lucid_vault', 'runtime_env', 'byo_local_env']),
    filesystem_access: z.enum(['none', 'workspace_sandbox', 'runtime_local']),
  }).optional(),
  limits: z.object({
    max_concurrent_runs: z.number().int().min(1).max(1000).optional(),
    tool_timeout_seconds: z.number().int().min(1).max(3600).optional(),
    memory_window: z.number().int().min(1).max(1_000_000).optional(),
    max_tokens: z.number().int().min(1).max(10_000_000).optional(),
    cost_budget_usd: z.number().min(0).max(1_000_000).optional(),
    retry_policy: z.enum(['none', 'safe', 'aggressive']).optional(),
    queue_behavior: z.enum(['fifo', 'latest_only', 'drop_when_busy']).optional(),
  }).optional(),
  maintenance: z.object({
    auto_update_policy: runtimeAutoUpdatePolicySchema,
  }).optional(),
  model: z.object({
    mode: z.enum(['lucid_auto', 'custom']),
    model_id: z.string().min(1).max(200).optional(),
    gateway_key_source: z.enum(['lucid', 'workspace', 'runtime']).optional(),
  }).optional(),
})
export const runtimeBootstrapConfigSchema = z.object({
  migration: runtimeMigrationConfigSchema.optional(),
  advanced: runtimeAdvancedConfigSchema.optional(),
})

export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])

export const agentStatusSchema = z.enum(['active', 'paused'])

export const feedEventTypeSchema = z.enum([
  'tool_call', 'tool_result', 'native_mutation_candidate', 'error',
  'runtime_migration_started', 'runtime_migration_completed', 'runtime_migration_failed',
  'channel_connected', 'channel_disconnected', 'channel_deactivated',
  'approval_requested', 'approval_resolved',
  'run_started', 'run_finished',
  'agent_paused', 'agent_resumed',
  'message_received', 'message_sent',
])

export const feedSeveritySchema = z.enum(['info', 'warn', 'warning', 'error', 'critical'])

export const approvalStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired'])

export const controlActionSchema = z.enum(['pause', 'resume', 'kill', 'escalate', 'nudge'])

// ─── API Request Schemas ───

export const controlRequestSchema = z.object({
  agent_id: z.string().uuid(),
  action: controlActionSchema,
  target_model: z.string().optional(),
  run_id: z.string().optional(),
})

export const approvalActionSchema = z.object({
  action: z.enum(['approved', 'denied']),
  reason: z.string().optional(),
})

export const feedQuerySchema = z.object({
  agent_id: z.string().uuid().optional(),
  event_type: feedEventTypeSchema.optional(),
  severity: feedSeveritySchema.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
})

export const agentListQuerySchema = z.object({
  status: agentStatusSchema.optional(),
  sort_by: z.enum(['name', 'status', 'cost', 'last_active', 'errors']).default('status'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
})

export const assignRuntimeSchema = z.object({
  runtimeId: z.string().uuid().nullable(),
})

// ─── Runtime Schemas ───

export const runtimeProviderSchema = z.enum([
  'railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual',
])

export const runtimeStatusSchema = z.enum([
  'pending', 'deploying', 'connected', 'stale', 'offline', 'failed', 'revoked',
])

export const runtimeTierSchema = z.enum(['dedicated', 'byo'])

export const createRuntimeSchema = z.object({
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  provider: runtimeProviderSchema,
  engine: agentEngineSchema.default('openclaw'),
  /** Provider-specific credentials (encrypted, never stored plaintext) */
  providerCredentials: z.record(z.string(), z.string()).optional(),
  /** Deploy intent: create this assistant when the runtime connects */
  pendingAgentName: z.string().min(1).max(100).optional(),
  pendingAgentConfig: z.record(z.string(), z.unknown()).optional(),
  /** Runtime tier — managed (Lucid-operated) or byo (user infra). Distinct from
   *  capabilitiesResponseSchema.deploymentMode which tracks connection mode (managed vs manual). */
  runtimeTier: runtimeTierSchema.optional(),
  /** Explicit runtime flavor — platform-facing vocabulary replacing dedicated/byo naming. */
  runtimeFlavor: runtimeFlavorSchema.exclude(['shared']).optional(),
  /** Channel mode — relay (C1, default) or native (C2a self-sovereign channels) */
  channelMode: z.enum(['relay', 'native']).optional(),
  /** Engine-neutral ownership of channel credentials and transport. */
  channelOwnership: channelOwnershipSchema.optional(),
  /** Dedicated scheduler transport mode. */
  dedicatedTransportMode: dedicatedTransportModeSchema.optional(),
  /** Optional engine-specific bootstrap/import metadata. */
  migration: runtimeMigrationConfigSchema.optional(),
  /** Preferred engine-agnostic runtime bootstrap metadata. */
  runtimeBootstrapConfig: runtimeBootstrapConfigSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.channelMode === 'native' && data.channelOwnership === 'lucid_relay') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['channelOwnership'],
      message: 'channelOwnership must be runtime_native when channelMode is native',
    })
  }
  if (data.channelMode === 'relay' && data.channelOwnership === 'runtime_native') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['channelOwnership'],
      message: 'channelOwnership must be lucid_relay when channelMode is relay',
    })
  }
  if (data.channelMode === 'native' && data.dedicatedTransportMode === 'relay') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dedicatedTransportMode'],
      message: 'dedicatedTransportMode must be native_pulse when channelMode is native',
    })
  }
  if (data.migration && data.runtimeBootstrapConfig?.migration) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runtimeBootstrapConfig'],
      message: 'Provide migration via runtimeBootstrapConfig or migration, not both',
    })
  }
  const migration = data.runtimeBootstrapConfig?.migration ?? data.migration
  if (migration && data.engine !== 'hermes') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runtimeBootstrapConfig'],
      message: 'migration is currently supported only for Hermes runtimes',
    })
  }
})

export const updateRuntimeConfigurationSchema = z.object({
  engine: agentEngineSchema.optional(),
  runtimeFlavor: runtimeFlavorSchema.exclude(['shared']).optional(),
  channelOwnership: channelOwnershipSchema.optional(),
  autoUpdatePolicy: runtimeAutoUpdatePolicySchema.optional(),
  maintenanceChannel: runtimeMaintenanceChannelSchema.optional(),
  runtimeBootstrapConfig: runtimeBootstrapConfigSchema.optional(),
})

export const nativeChannelStatusSchema = z.object({
  channelType: z.string().max(50),
  accountId: z.string().max(100),
  status: z.enum(['connected', 'reconnecting', 'error', 'stopped']),
  lastMessageAt: z.string().datetime().optional(),
  errorMessage: z.string().max(500).optional(),
}).refine(
  (data) => data.status !== 'error' || !!data.errorMessage,
  { message: 'errorMessage required when status is error', path: ['errorMessage'] }
)

export const heartbeatSchema = z.object({
  runtimeId: z.string().uuid(),
  generation: z.number().int().min(1),
  cpuPercent: z.number().min(0).max(100),
  ramPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  gpuPercent: z.number().min(0).max(100).optional(),
  pendingEvents: z.number().int().min(0),
  deadLetters: z.number().int().min(0),
  engine: agentEngineSchema.optional(),
  runtimeProtocol: runtimeProtocolSchema.optional(),
  engineVersion: z.string().optional(),
  runtimeVersion: z.string().optional(),
  openclawVersion: z.string().optional(),
  agentCount: z.number().int().min(0),
  uptimeSeconds: z.number().int().min(0),
  status: z.enum(['connected', 'shutdown']).optional(),
  // C2a: native channel connection status
  nativeChannels: z.array(nativeChannelStatusSchema).max(20).optional(),
  // Runtime capability plane: cached adapter/engine feature report.
  adapterIdentity: RuntimeAdapterIdentitySchema.optional(),
  nativeCapabilities: z.array(RuntimeNativeCapabilitySchema).max(100).optional(),
  runtimeServices: z.array(RuntimeServiceDescriptorSchema).max(100).optional(),
  adapterProbe: RuntimeAdapterProbeSummarySchema.optional(),
  transcriptParser: RuntimeTranscriptParserStatusSchema.optional(),
  commandSpec: RuntimeCommandSpecSchema.optional(),
  engineHomePolicy: RuntimeEngineHomePolicySchema.optional(),
  // Hardware specs — reported once per session
  systemInfo: z.object({
    cpuModel: z.string().max(200).optional(),
    cpuCores: z.number().int().min(1).max(1024).optional(),
    ramTotalGb: z.number().min(0).max(65536).optional(),
    diskTotalGb: z.number().min(0).max(1048576).optional(),
    platform: z.string().max(50).optional(),
    arch: z.string().max(50).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (!data.openclawVersion && !data.runtimeVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runtimeVersion'],
      message: 'runtimeVersion or openclawVersion is required',
    })
  }
})

export const runtimeEventSchema = z.object({
  agentId: z.string().uuid().optional(),
  eventType: z.enum([
    'tool_call', 'tool_result', 'native_mutation_candidate', 'error',
    'message_received', 'message_sent',
    'run_started', 'run_finished',
    'channel_connected', 'channel_disconnected', 'channel_deactivated',
    'runtime_migration_started', 'runtime_migration_completed', 'runtime_migration_failed',
  ]),
  // `critical` is reserved for permanent channel deactivations and other
  // operator-must-act events. Worker-side severity field uses 'warning' (not
  // 'warn') to match the wire contract in @lucid/agent-bridge.
  severity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
  payload: z.record(z.string(), z.unknown()).default({}),
})

export const runtimeEventsSchema = z.object({
  events: z.array(runtimeEventSchema).max(100),
})

export const runtimeApprovalSchema = z.object({
  agentId: z.string().uuid(),
  toolName: z.string(),
  toolArgs: z.record(z.string(), z.unknown()),
  runId: z.string(),
  timeoutMs: z.number().int().min(1000).max(600_000).default(300_000),
})

export const runtimeHealthScoreSchema = z.object({
  agentId: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  dimensions: z.record(z.string(), z.number().min(0).max(100)),
})

export const runtimeCostSchema = z.object({
  agentId: z.string().uuid(),
  runId: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
})

export const deployForAgentSchema = z.object({
  requestId: z.string().uuid(),
  agentId: z.string().uuid(),
  engine: agentEngineSchema.default('openclaw'),
  provider: runtimeProviderSchema.default('railway'),
  runtimeFlavor: runtimeFlavorSchema.exclude(['shared']).default('c1_managed'),
  channelOwnership: channelOwnershipSchema.optional(),
  dedicatedTransportMode: dedicatedTransportModeSchema.optional(),
  displayName: z.string().min(1).max(100).optional(),
  migration: runtimeMigrationConfigSchema.optional(),
  runtimeBootstrapConfig: runtimeBootstrapConfigSchema.optional(),
})

// ─── Provider Capability Schemas ───

export const metricsDatapointSchema = z.object({
  timestamp: z.number(),
  value: z.number(),
})

export const metricSeriesSchema = z.object({
  current: z.number().optional(),
  series: z.array(metricsDatapointSchema).optional(),
  unit: z.enum(['percent', 'bytes', 'count', 'ms']).optional(),
})

export const deploymentMetricsSchema = z.object({
  cpu: metricSeriesSchema.optional(),
  memory: metricSeriesSchema.optional(),
  disk: metricSeriesSchema.optional(),
  network: z.object({
    rxBytes: metricSeriesSchema.optional(),
    txBytes: metricSeriesSchema.optional(),
  }).optional(),
  collectedAt: z.number(),
})

export const providerCapabilitiesSchema = z.object({
  lifecycle: z.object({
    stop: z.boolean(),
    resume: z.boolean(),
    redeploy: z.boolean(),
    terminate: z.boolean(),
    scale: z.boolean(),
  }),
  observability: z.object({
    status: z.boolean(),
    logs: z.boolean(),
    metrics: z.boolean(),
    healthcheckConfig: z.boolean(),
  }),
  configuration: z.object({
    envUpdate: z.boolean(),
    customDomains: z.boolean(),
    restartPolicy: z.boolean(),
    volumes: z.boolean(),
    multiRegion: z.boolean(),
  }),
})

export const capabilitiesResponseSchema = z.object({
  provider: z.string(),
  engine: agentEngineSchema.optional(),
  runtimeProtocol: runtimeProtocolSchema.optional(),
  deploymentMode: z.enum(['managed', 'manual']),
  capabilities: providerCapabilitiesSchema.nullable(),
  adapterIdentity: RuntimeAdapterIdentitySchema.nullable().optional(),
  nativeCapabilities: z.array(RuntimeNativeCapabilitySchema).optional(),
  runtimeServices: z.array(RuntimeServiceDescriptorSchema).optional(),
  adapterProbe: RuntimeAdapterProbeSummarySchema.nullable().optional(),
  transcriptParser: RuntimeTranscriptParserStatusSchema.nullable().optional(),
  commandSpec: RuntimeCommandSpecSchema.nullable().optional(),
  engineHomePolicy: RuntimeEngineHomePolicySchema.nullable().optional(),
  capabilityReportedAt: z.string().datetime().nullable().optional(),
  managementCommands: z.array(RuntimeManagementCommandSchema).optional(),
  engineCapabilities: z.object({
    supportsShared: z.boolean(),
    supportsC1: z.boolean(),
    supportsC2a: z.boolean(),
    supportsRelayChannels: z.boolean(),
    supportsNativeChannels: z.boolean(),
    supportsDeployIntent: z.boolean(),
    supportsSharedRunner: z.boolean(),
    supportMatrix: z.object({
      shared: engineSupportLevelSchema,
      c1Managed: engineSupportLevelSchema,
      c2aAutonomous: engineSupportLevelSchema,
      relayChannels: engineSupportLevelSchema,
      nativeChannels: engineSupportLevelSchema,
      toolRuntime: engineSupportLevelSchema,
      approvals: engineSupportLevelSchema,
      usageAccounting: engineSupportLevelSchema,
    }),
    notes: z.array(z.string()).optional(),
  }).optional(),
  warning: z.string().optional(),
})

export const redeployResultSchema = z.object({
  success: z.boolean(),
  deployment_id: z.string(),
  status: z.enum(['queued', 'deploying', 'running', 'failed']),
  url: z.string().optional(),
  operation_id: z.string().optional(),
})

export const runtimeMaintenanceRequestSchema = z.object({
  action: runtimeMaintenanceActionSchema,
  targetImageRef: z.string().min(1).max(500).optional(),
  targetImageDigest: z.string().min(1).max(500).optional(),
})

export const runtimeMaintenanceJobSchema = z.object({
  id: z.string().uuid(),
  runtimeId: z.string().uuid(),
  orgId: z.string().uuid(),
  provider: z.string(),
  action: runtimeMaintenanceActionSchema,
  status: runtimeMaintenanceJobStatusSchema,
  targetImageRef: z.string().nullable(),
  targetImageDigest: z.string().nullable(),
  providerOperationId: z.string().nullable(),
  providerDeploymentId: z.string().nullable(),
  requestedBy: z.string().nullable(),
  resultPayload: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const runtimeMaintenanceStateSchema = z.object({
  runtimeId: z.string().uuid(),
  managedByLucid: z.boolean(),
  maintenanceChannel: runtimeMaintenanceChannelSchema,
  autoUpdatePolicy: runtimeAutoUpdatePolicySchema,
  currentImageRef: z.string().nullable(),
  currentImageDigest: z.string().nullable(),
  targetImageRef: z.string().nullable(),
  lastSuccessfulImageRef: z.string().nullable(),
  lastMaintenanceAction: runtimeMaintenanceActionSchema.nullable(),
  lastMaintenanceAt: z.string().datetime().nullable(),
  lastMaintenanceError: z.string().nullable(),
  jobs: z.array(runtimeMaintenanceJobSchema),
})

export const domainInfoSchema = z.object({
  domain: z.string(),
  isDefault: z.boolean().optional(),
  ssl: z.boolean().optional(),
})

// ─── Provider Capability Request Schemas ───

export const updateEnvSchema = z.object({
  vars: z.record(z.string(), z.string().or(z.null())),
})

export const updateHealthcheckSchema = z.object({
  path: z.string().min(1),
  intervalSeconds: z.number().int().min(1).max(3600),
  timeoutSeconds: z.number().int().min(1).max(300),
})

export const updateRestartPolicySchema = z.object({
  policy: z.enum(['always', 'on_failure', 'never']),
})

export const addDomainSchema = z.object({
  domain: z.string().min(1).max(253),
})

export const metricsQuerySchema = z.object({
  range: z.coerce.number().int().min(60).max(2_592_000).optional(),
  granularity: z.enum(['minute', 'hour', 'day']).optional(),
})

export const createRuntimeManagementCommandSchema = z.object({
  commandType: z.string().regex(/^[a-z][a-z0-9_.:-]*$/).max(100),
  targetCapabilityId: z.string().regex(/^[a-z][a-z0-9_.:-]*$/).max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const ackRuntimeManagementCommandSchema = z.object({
  commandId: z.string().uuid(),
  status: z.enum([
    'accepted',
    'rejected',
    'needs_user_action',
    'applied',
    'failed',
  ]),
  response: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().max(2000).nullable().optional(),
})

// ─── Channel Architecture: REST Message Relay Schemas ───

export const claimInboundSchema = z.object({
  batchSize: z.number().int().min(1).max(50).default(10),
  waitMs: z.number().int().min(0).max(30_000).default(15_000),
})

// runId accepts both UUID (legacy) and Pulse format (uuid:attempt)
const pulseRunId = z.string().min(1).max(200)

export const completeInboundSchema = z.object({
  eventId: z.string().uuid(),
  runId: pulseRunId,
  responseText: z.string().min(1).max(100_000),
  resolvedUserMessageText: z.string().max(100_000).optional(),
  outputArtifacts: z.array(z.object({
    toolName: z.string().max(100),
    result: z.string().max(50_000),
  })).max(50).optional(),
  tokenUsage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    estimatedCostUsd: z.number().min(0),
  }).optional(),
})

// ─── Pulse: Lease Renewal + Fail Inbound Schemas ───

export const renewLeaseSchema = z.object({
  eventId: z.string().uuid(),
  runId: pulseRunId,
})

export const failInboundSchema = z.object({
  eventId: z.string().uuid(),
  runId: pulseRunId,
  errorMessage: z.string().max(10_000).default('Processing failed'),
})

// ─── Pulse: Enqueue + Claim Self (C2a) Schema ───

export const enqueueAndClaimSelfSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(['inbound', 'outbound', 'scheduled']),
  agentId: z.string().uuid(),
  orgId: z.string().uuid(),
  priority: z.enum(['critical', 'normal', 'background']).default('normal'),
})

// ─── Channel Architecture: Governance Action Schema ───

export const governanceActionSchema = z.object({
  type: z.enum(['pause_channel', 'resume_channel', 'stop_all_channels']),
  channelType: z.string().max(50).optional(),
  accountId: z.string().max(100).optional(),
}).refine(
  (data) => data.type === 'stop_all_channels' || (data.channelType && data.accountId),
  { message: 'channelType and accountId required for pause/resume actions' }
)

// ─── Phase 3N: Step Execution Protocol Schemas ───

export const stepCallbackSchema = z.object({
  stepId: z.string().uuid(),
  callbackToken: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  output: z.string().max(102400).optional(),
  errorMessage: z.string().max(10000).optional(),
})

export const enqueueStepSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(['inbound', 'outbound', 'scheduled']),
  agentId: z.string().uuid(),
  orgId: z.string().uuid(),
  stepType: z.enum(['webhook', 'approval']),
  priority: z.enum(['critical', 'normal', 'background']).optional(),
  webhookUrl: z.string().url().startsWith('https://', { message: 'webhookUrl must use HTTPS' }).optional(),
  webhookPayload: z.record(z.string(), z.unknown()).optional(),
  approvalConfig: z.object({
    toolName: z.string().min(1),
    toolArgs: z.record(z.string(), z.unknown()),
    timeoutSeconds: z.number().int().min(10).max(1800),
  }).optional(),
})
