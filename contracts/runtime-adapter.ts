/**
 * Runtime adapter contract.
 *
 * This is the shared shape for first-party Hermes/OpenClaw adapters and
 * external/BYO adapters. It keeps Lucid core engine-agnostic while preserving
 * enough detail for Mission Control, worker execution, CLI tooling, and drift
 * gates.
 */

import { z } from 'zod'
import {
  AGENT_ENGINES,
  RUNTIME_FLAVORS,
  SUPPORT_LEVELS,
} from '@lucid/runtime-compat'
import { RuntimeExecutionContextSchema } from './runtime-execution'
import { RuntimeExecutionTargetKindSchema, RuntimeExecutionTargetSchema } from './runtime-execution-target'
import { RuntimeTranscriptParserContractSchema } from './runtime-transcript'
import { RuntimeCapabilitySupportSchema } from './runtime-capabilities'

export const RuntimeAdapterSourceSchema = z.enum([
  'builtin',
  'trusted_registry',
  'local_path',
  'external_registry',
  'byo_bridge',
])

export type RuntimeAdapterSource = z.infer<typeof RuntimeAdapterSourceSchema>

export const RuntimeAdapterPackageStatusSchema = z.enum([
  'active',
  'disabled',
  'override_paused',
  'missing',
  'load_failed',
])

export type RuntimeAdapterPackageStatus = z.infer<typeof RuntimeAdapterPackageStatusSchema>

export const RuntimeAdapterManageModeSchema = z.enum([
  'none',
  'read_only',
  'request_review',
  'apply_via_bridge',
  'runtime_native_ui',
  'lucid_managed',
])

export type RuntimeAdapterManageMode = z.infer<typeof RuntimeAdapterManageModeSchema>

export const RuntimeAdapterConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'select', 'toggle', 'number', 'textarea', 'combobox', 'json', 'secret_ref']),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  hint: z.string().nullable().optional(),
  options: z.array(z.object({
    label: z.string().min(1),
    value: z.string(),
    group: z.string().nullable().optional(),
  })).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeAdapterConfigField = z.infer<typeof RuntimeAdapterConfigFieldSchema>

export const RuntimeAdapterConfigSchemaSchema = z.object({
  version: z.literal(1),
  fields: z.array(RuntimeAdapterConfigFieldSchema),
})

export type RuntimeAdapterConfigSchema = z.infer<typeof RuntimeAdapterConfigSchemaSchema>

export const RuntimeAdapterEnvironmentCheckSchema = z.object({
  code: z.string().min(1),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().min(1),
  detail: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  targetKind: RuntimeExecutionTargetKindSchema.nullable().optional(),
})

export type RuntimeAdapterEnvironmentCheck = z.infer<typeof RuntimeAdapterEnvironmentCheckSchema>

export const RuntimeAdapterEnvironmentTestResultSchema = z.object({
  adapterType: z.string().min(1),
  status: z.enum(['pass', 'warn', 'fail']),
  target: RuntimeExecutionTargetSchema.nullable(),
  checks: z.array(RuntimeAdapterEnvironmentCheckSchema),
  testedAt: z.string().datetime(),
})

export type RuntimeAdapterEnvironmentTestResult = z.infer<typeof RuntimeAdapterEnvironmentTestResultSchema>

export const RuntimeAdapterCommandSpecSchema = z.object({
  command: z.string().min(1),
  detectCommand: z.string().min(1).nullable().optional(),
  installCommand: z.string().min(1).nullable().optional(),
  workingDirectoryPolicy: z.enum(['lucid_managed', 'runtime_owned', 'adapter_default']).default('adapter_default'),
})

export type RuntimeAdapterCommandSpec = z.infer<typeof RuntimeAdapterCommandSpecSchema>

export const RuntimeAdapterQuotaWindowSchema = z.object({
  label: z.string().min(1),
  usedPercent: z.number().min(0).max(100).nullable(),
  resetsAt: z.string().datetime().nullable(),
  valueLabel: z.string().nullable(),
  detail: z.string().nullable().optional(),
})

export type RuntimeAdapterQuotaWindow = z.infer<typeof RuntimeAdapterQuotaWindowSchema>

export const RuntimeAdapterRuntimeServiceSchema = z.object({
  serviceName: z.string().min(1),
  status: z.enum(['starting', 'running', 'stopped', 'failed', 'unknown']).default('unknown'),
  lifecycle: z.enum(['shared', 'ephemeral', 'runtime_owned']).nullable().optional(),
  command: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  port: z.number().int().positive().nullable().optional(),
  url: z.string().url().nullable().optional(),
  healthStatus: z.enum(['unknown', 'healthy', 'unhealthy']).default('unknown'),
  providerRef: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export type RuntimeAdapterRuntimeService = z.infer<typeof RuntimeAdapterRuntimeServiceSchema>

export const RuntimeAdapterCapabilityManifestSchema = z.object({
  configSchema: z.boolean().default(false),
  transcriptParser: z.boolean().default(false),
  environmentTest: z.boolean().default(false),
  runtimeCommandSpec: z.boolean().default(false),
  modelDiscovery: z.boolean().default(false),
  modelProfiles: z.boolean().default(false),
  quotaWindows: z.boolean().default(false),
  sessions: z.boolean().default(false),
  runtimeServices: z.boolean().default(false),
  skills: z.boolean().default(false),
  instructionsBundle: z.boolean().default(false),
  localRunToken: z.boolean().default(false),
  engineHome: z.boolean().default(false),
  nativeChannels: z.boolean().default(false),
  supportedExecutionTargets: z.array(RuntimeExecutionTargetKindSchema).default([]),
  canonicalCapabilities: z.array(RuntimeCapabilitySupportSchema).default([]),
})

export type RuntimeAdapterCapabilityManifest = z.infer<typeof RuntimeAdapterCapabilityManifestSchema>

export const RuntimeAdapterFeatureSupportSchema = z.object({
  feature: z.string().min(1),
  supportLevel: z.enum(SUPPORT_LEVELS),
  manageMode: RuntimeAdapterManageModeSchema,
  notes: z.array(z.string()).default([]),
})

export type RuntimeAdapterFeatureSupport = z.infer<typeof RuntimeAdapterFeatureSupportSchema>

export const RuntimeAdapterManifestSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_:-]*$/),
  label: z.string().min(1),
  version: z.string().min(1),
  engine: z.enum(AGENT_ENGINES),
  runtimeFlavors: z.array(z.enum(RUNTIME_FLAVORS)).min(1),
  source: RuntimeAdapterSourceSchema,
  status: RuntimeAdapterPackageStatusSchema.default('active'),
  packageName: z.string().min(1).nullable().optional(),
  packageVersion: z.string().min(1).nullable().optional(),
  homepageUrl: z.string().url().nullable().optional(),
  capabilities: RuntimeAdapterCapabilityManifestSchema,
  featureSupport: z.array(RuntimeAdapterFeatureSupportSchema).default([]),
  transcriptParser: RuntimeTranscriptParserContractSchema.nullable().optional(),
})

export type RuntimeAdapterManifest = z.infer<typeof RuntimeAdapterManifestSchema>

export const RuntimeAdapterExecutionContextSchema = z.object({
  runId: z.string().uuid(),
  adapter: RuntimeAdapterManifestSchema,
  runtimeContext: RuntimeExecutionContextSchema,
  executionTarget: RuntimeExecutionTargetSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  session: z.record(z.string(), z.unknown()).nullable().optional(),
  task: z.record(z.string(), z.unknown()).default({}),
  effectiveToolsets: z.array(z.string()).default([]),
  engineHomeSnapshotId: z.string().uuid().nullable().optional(),
  authTokenRef: z.string().min(1).nullable().optional(),
})

export type RuntimeAdapterExecutionContext = z.infer<typeof RuntimeAdapterExecutionContextSchema>

export const RuntimeAdapterExecutionResultSchema = z.object({
  status: z.enum(['succeeded', 'failed', 'cancelled', 'timed_out', 'needs_user_action']),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorFamily: z.string().nullable().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().default(0),
    outputTokens: z.number().int().nonnegative().default(0),
    cachedInputTokens: z.number().int().nonnegative().optional(),
  }).nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  provider: z.string().nullable().optional(),
  biller: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  billingType: z.enum(['api', 'subscription', 'metered_api', 'subscription_included', 'subscription_overage', 'credits', 'fixed', 'unknown']).default('unknown'),
  sessionParams: z.record(z.string(), z.unknown()).nullable().optional(),
  sessionDisplayId: z.string().nullable().optional(),
  clearSession: z.boolean().default(false),
  runtimeServices: z.array(RuntimeAdapterRuntimeServiceSchema).default([]),
  quotaWindows: z.array(RuntimeAdapterQuotaWindowSchema).default([]),
  resultJson: z.record(z.string(), z.unknown()).nullable().optional(),
  summary: z.string().nullable().optional(),
})

export type RuntimeAdapterExecutionResult = z.infer<typeof RuntimeAdapterExecutionResultSchema>
