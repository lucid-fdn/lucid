/**
 * Engine-neutral runtime execution target contract.
 *
 * This describes where an adapter run executes. It is intentionally separate
 * from engine identity: Hermes, OpenClaw, and future engines all consume the
 * same target shapes.
 */

import { z } from 'zod'

export const RuntimeExecutionTargetKindSchema = z.enum([
  'local',
  'shared_worker',
  'dedicated_worker',
  'byo_bridge',
  'ssh',
  'sandbox',
  'microvm',
  'plugin_cloud',
])

export type RuntimeExecutionTargetKind = z.infer<typeof RuntimeExecutionTargetKindSchema>

export const RuntimeExecutionTargetStatusSchema = z.enum([
  'available',
  'leased',
  'unavailable',
  'degraded',
])

export type RuntimeExecutionTargetStatus = z.infer<typeof RuntimeExecutionTargetStatusSchema>

export const RuntimeWorkspaceSyncStrategySchema = z.enum([
  'none',
  'lucid_managed',
  'bridge_delta',
  'archive_upload_download',
  'git_worktree',
  'provider_defined',
])

export type RuntimeWorkspaceSyncStrategy = z.infer<typeof RuntimeWorkspaceSyncStrategySchema>

export const RuntimeExecutionTargetBaseSchema = z.object({
  kind: RuntimeExecutionTargetKindSchema,
  targetId: z.string().min(1).nullable().optional(),
  environmentId: z.string().uuid().nullable().optional(),
  leaseId: z.string().uuid().nullable().optional(),
  status: RuntimeExecutionTargetStatusSchema.default('available'),
  displayName: z.string().min(1).nullable().optional(),
  workspaceRoot: z.string().min(1).nullable().optional(),
  runtimeHomeRoot: z.string().min(1).nullable().optional(),
  workspaceSync: RuntimeWorkspaceSyncStrategySchema.default('none'),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const LocalRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('local'),
})

export const SharedWorkerRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('shared_worker'),
})

export const DedicatedWorkerRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('dedicated_worker'),
  runtimeId: z.string().uuid(),
  generation: z.number().int().nonnegative().nullable().optional(),
})

export const ByoBridgeRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('byo_bridge'),
  runtimeId: z.string().uuid(),
  bridgeUrl: z.string().url().nullable().optional(),
  bridgeMode: z.enum(['observe', 'full']).default('full'),
})

export const SshRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('ssh'),
  host: z.string().min(1),
  port: z.number().int().positive().default(22),
  username: z.string().min(1),
  remoteWorkspaceRoot: z.string().min(1),
})

export const SandboxRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('sandbox'),
  provider: z.string().min(1),
  providerLeaseId: z.string().min(1).nullable().optional(),
  remoteWorkspaceRoot: z.string().min(1).nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
})

export const MicrovmRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('microvm'),
  provider: z.string().min(1),
  imageRef: z.string().min(1).nullable().optional(),
  providerLeaseId: z.string().min(1).nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
})

export const PluginCloudRuntimeExecutionTargetSchema = RuntimeExecutionTargetBaseSchema.extend({
  kind: z.literal('plugin_cloud'),
  provider: z.string().min(1),
  driverKey: z.string().min(1),
  providerLeaseId: z.string().min(1).nullable().optional(),
})

export const RuntimeExecutionTargetSchema = z.discriminatedUnion('kind', [
  LocalRuntimeExecutionTargetSchema,
  SharedWorkerRuntimeExecutionTargetSchema,
  DedicatedWorkerRuntimeExecutionTargetSchema,
  ByoBridgeRuntimeExecutionTargetSchema,
  SshRuntimeExecutionTargetSchema,
  SandboxRuntimeExecutionTargetSchema,
  MicrovmRuntimeExecutionTargetSchema,
  PluginCloudRuntimeExecutionTargetSchema,
])

export type RuntimeExecutionTarget = z.infer<typeof RuntimeExecutionTargetSchema>

export const RuntimeWorkspaceRealizationSchema = z.object({
  realizationId: z.string().uuid(),
  target: RuntimeExecutionTargetSchema,
  sourceWorkspace: z.object({
    kind: z.enum(['project_primary', 'task_session', 'agent_home', 'runtime_home']),
    localPath: z.string().min(1).nullable(),
    repoUrl: z.string().min(1).nullable(),
    repoRef: z.string().min(1).nullable(),
  }),
  remoteWorkspacePath: z.string().min(1).nullable(),
  syncStrategy: RuntimeWorkspaceSyncStrategySchema,
  bootstrapCommand: z.string().min(1).nullable(),
  restoreCommand: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type RuntimeWorkspaceRealization = z.infer<typeof RuntimeWorkspaceRealizationSchema>
