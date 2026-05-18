/**
 * Runtime capability plane contract.
 *
 * Lucid owns the control-plane vocabulary here. Engines and adapters report
 * their native features into this shape so Mission Control can stay engine and
 * runtime agnostic without flattening engine-specific value.
 */

import { z } from 'zod'
import {
  AGENT_ENGINES,
  RUNTIME_FLAVORS,
  SUPPORT_LEVELS,
} from '@lucid/runtime-compat'

export const RuntimeCapabilityExecutionTargetKindSchema = z.enum([
  'local',
  'shared_worker',
  'dedicated_worker',
  'byo_bridge',
  'ssh',
  'sandbox',
  'microvm',
  'plugin_cloud',
])

export type RuntimeCapabilityExecutionTargetKind = z.infer<typeof RuntimeCapabilityExecutionTargetKindSchema>

export const RuntimeCapabilityAdapterSourceSchema = z.enum([
  'builtin',
  'trusted_registry',
  'local_path',
  'external_registry',
  'byo_bridge',
])

export type RuntimeCapabilityAdapterSource = z.infer<typeof RuntimeCapabilityAdapterSourceSchema>

export const RuntimeCapabilityManageModeSchema = z.enum([
  'none',
  'read_only',
  'request_review',
  'apply_via_bridge',
  'runtime_native_ui',
  'lucid_managed',
])

export type RuntimeCapabilityManageMode = z.infer<typeof RuntimeCapabilityManageModeSchema>

export const RuntimeCapabilityAuthoritySchema = z.enum([
  'lucid',
  'engine',
  'adapter',
  'operator',
  'external',
])

export type RuntimeCapabilityAuthority = z.infer<typeof RuntimeCapabilityAuthoritySchema>

export const RuntimeCapabilityAvailabilitySchema = z.enum([
  'available',
  'limited',
  'needs_setup',
  'unavailable',
  'unknown',
])

export type RuntimeCapabilityAvailability = z.infer<typeof RuntimeCapabilityAvailabilitySchema>

export const RuntimeCapabilityHealthSchema = z.enum([
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
])

export type RuntimeCapabilityHealth = z.infer<typeof RuntimeCapabilityHealthSchema>

export const RuntimeNativeCapabilityKindSchema = z.enum([
  'approvals',
  'browser',
  'channels',
  'checkpoints',
  'control_commands',
  'dreaming',
  'engine_home',
  'heartbeat',
  'kanban',
  'local_files',
  'memory',
  'migration',
  'media_understanding',
  'model_discovery',
  'model_profiles',
  'native_tools',
  'nodes',
  'orchestration',
  'mutations',
  'native_channels',
  'native_scheduler',
  'plugins',
  'provider_keys',
  'quota_windows',
  'relay_channels',
  'runtime_services',
  'routines',
  'sessions',
  'skills',
  'transcript_parser',
  'usage_accounting',
])

export type RuntimeNativeCapabilityKind = z.infer<typeof RuntimeNativeCapabilityKindSchema>

export const RuntimeAdapterIdentitySchema = z.object({
  adapterType: z.string().regex(/^[a-z][a-z0-9_:-]*$/),
  label: z.string().min(1),
  version: z.string().min(1),
  source: RuntimeCapabilityAdapterSourceSchema.default('builtin'),
  packageName: z.string().min(1).nullable().optional(),
  packageVersion: z.string().min(1).nullable().optional(),
  homepageUrl: z.string().url().nullable().optional(),
  executionTargets: z.array(RuntimeCapabilityExecutionTargetKindSchema).default([]),
  managedBy: RuntimeCapabilityAuthoritySchema.default('adapter'),
  protocolVersion: z.string().min(1).default('runtime-capability-v1'),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeAdapterIdentity = z.infer<typeof RuntimeAdapterIdentitySchema>

export const RuntimeNativeCapabilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.:-]*$/),
  kind: RuntimeNativeCapabilityKindSchema,
  label: z.string().min(1),
  description: z.string().max(500).nullable().optional(),
  engine: z.enum(AGENT_ENGINES).nullable().optional(),
  runtimeFlavors: z.array(z.enum(RUNTIME_FLAVORS)).default([]),
  supportLevel: z.enum(SUPPORT_LEVELS).default('experimental'),
  authority: RuntimeCapabilityAuthoritySchema,
  availability: RuntimeCapabilityAvailabilitySchema.default('unknown'),
  health: RuntimeCapabilityHealthSchema.default('unknown'),
  manageMode: RuntimeCapabilityManageModeSchema.default('read_only'),
  source: z.enum(['lucid', 'engine', 'adapter', 'runtime', 'projection']).default('adapter'),
  version: z.string().min(1).nullable().optional(),
  readOnly: z.boolean().default(false),
  requiresUserAction: z.boolean().default(false),
  supportsDiff: z.boolean().default(false),
  supportsImport: z.boolean().default(false),
  supportsExport: z.boolean().default(false),
  supportsRollback: z.boolean().default(false),
  notes: z.array(z.string().max(300)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeNativeCapability = z.infer<typeof RuntimeNativeCapabilitySchema>

export const RuntimeServiceDescriptorSchema = z.object({
  serviceName: z.string().min(1),
  label: z.string().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['starting', 'running', 'stopped', 'failed', 'unknown']).default('unknown'),
  lifecycle: z.enum(['shared', 'ephemeral', 'runtime_owned']).nullable().optional(),
  command: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  port: z.number().int().positive().nullable().optional(),
  url: z.string().url().nullable().optional(),
  healthStatus: z.enum(['unknown', 'healthy', 'unhealthy']).default('unknown'),
  providerRef: z.string().nullable().optional(),
  externallyVisible: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeServiceDescriptor = z.infer<typeof RuntimeServiceDescriptorSchema>

export const RuntimeCommandSpecSchema = z.object({
  command: z.string().min(1),
  detectCommand: z.string().min(1).nullable().optional(),
  installCommand: z.string().min(1).nullable().optional(),
  workingDirectoryPolicy: z.enum(['lucid_managed', 'runtime_owned', 'adapter_default']).default('adapter_default'),
  displayName: z.string().min(1).nullable().optional(),
  parserSupport: z.enum(['native', 'adapter', 'lucid_fallback', 'none']).default('none'),
  notes: z.array(z.string().max(300)).default([]),
})

export type RuntimeCommandSpec = z.infer<typeof RuntimeCommandSpecSchema>

export const RuntimeAdapterProbeCheckSchema = z.object({
  code: z.string().min(1),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().min(1),
  detail: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  targetKind: RuntimeCapabilityExecutionTargetKindSchema.nullable().optional(),
})

export type RuntimeAdapterProbeCheck = z.infer<typeof RuntimeAdapterProbeCheckSchema>

export const RuntimeAdapterProbeTargetSchema = z.object({
  kind: RuntimeCapabilityExecutionTargetKindSchema,
  targetId: z.string().min(1).nullable().optional(),
  status: z.enum(['available', 'leased', 'unavailable', 'degraded']).default('available'),
  displayName: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeAdapterProbeTarget = z.infer<typeof RuntimeAdapterProbeTargetSchema>

export const RuntimeAdapterProbeSummarySchema = z.object({
  adapterType: z.string().min(1),
  status: z.enum(['pass', 'warn', 'fail', 'unknown']).default('unknown'),
  target: RuntimeAdapterProbeTargetSchema.nullable().optional(),
  checks: z.array(RuntimeAdapterProbeCheckSchema).default([]),
  testedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  cached: z.boolean().default(true),
  source: z.enum(['heartbeat', 'api', 'cli', 'worker']).default('heartbeat'),
})

export type RuntimeAdapterProbeSummary = z.infer<typeof RuntimeAdapterProbeSummarySchema>

export const RuntimeTranscriptParserStatusSchema = z.object({
  supported: z.boolean(),
  parserId: z.string().min(1).nullable().optional(),
  version: z.string().min(1).nullable().optional(),
  mode: z.enum(['native', 'adapter', 'lucid_fallback', 'unavailable']).default('unavailable'),
  status: z.enum(['ready', 'needs_setup', 'unavailable', 'unknown']).default('unknown'),
  lastTestedAt: z.string().datetime().nullable().optional(),
  sampleTestStatus: z.enum(['pass', 'warn', 'fail', 'unknown']).default('unknown'),
  errorCode: z.string().min(1).nullable().optional(),
  notes: z.array(z.string().max(300)).default([]),
})

export type RuntimeTranscriptParserStatus = z.infer<typeof RuntimeTranscriptParserStatusSchema>

export const RuntimeEngineHomePolicySchema = z.object({
  mode: z.enum([
    'none',
    'lucid_managed',
    'engine_native',
    'ehv_projected',
    'runtime_owned',
    'hybrid',
  ]),
  authority: RuntimeCapabilityAuthoritySchema,
  writePolicy: z.enum(['read_only', 'review_required', 'runtime_native', 'lucid_committed']),
  snapshotSupport: z.boolean().default(false),
  diffSupport: z.boolean().default(false),
  rollbackSupport: z.boolean().default(false),
  importExportSupport: z.boolean().default(false),
  durableInShared: z.boolean().default(false),
  notes: z.array(z.string().max(300)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeEngineHomePolicy = z.infer<typeof RuntimeEngineHomePolicySchema>

export const RuntimeCapabilityReportSchema = z.object({
  adapterIdentity: RuntimeAdapterIdentitySchema.nullable().optional(),
  nativeCapabilities: z.array(RuntimeNativeCapabilitySchema).default([]),
  runtimeServices: z.array(RuntimeServiceDescriptorSchema).default([]),
  adapterProbe: RuntimeAdapterProbeSummarySchema.nullable().optional(),
  transcriptParser: RuntimeTranscriptParserStatusSchema.nullable().optional(),
  commandSpec: RuntimeCommandSpecSchema.nullable().optional(),
  engineHomePolicy: RuntimeEngineHomePolicySchema.nullable().optional(),
  reportedAt: z.string().datetime().nullable().optional(),
})

export type RuntimeCapabilityReport = z.infer<typeof RuntimeCapabilityReportSchema>

export const RuntimeManagementCommandStatusSchema = z.enum([
  'queued',
  'sent',
  'accepted',
  'rejected',
  'needs_user_action',
  'applied',
  'failed',
  'expired',
])

export type RuntimeManagementCommandStatus = z.infer<typeof RuntimeManagementCommandStatusSchema>

export const RuntimeManagementCommandSchema = z.object({
  id: z.string().uuid(),
  runtimeId: z.string().uuid(),
  orgId: z.string().uuid(),
  commandType: z.string().regex(/^[a-z][a-z0-9_.:-]*$/),
  targetCapabilityId: z.string().regex(/^[a-z][a-z0-9_.:-]*$/).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: RuntimeManagementCommandStatusSchema,
  response: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  requestedBy: z.string().uuid().nullable().optional(),
  requestedAt: z.string().datetime(),
  dispatchedAt: z.string().datetime().nullable().optional(),
  acknowledgedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

export type RuntimeManagementCommand = z.infer<typeof RuntimeManagementCommandSchema>
