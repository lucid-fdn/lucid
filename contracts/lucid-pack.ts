import { z } from 'zod'
import { TemplateCompositionSchema } from './template-composition'

export const LucidPackResourceKindSchema = z.enum([
  'agent',
  'team',
  'workflow',
  'routine',
  'knowledge_source',
  'browser_procedure',
  'host_playbook',
  'skill',
  'doc',
  'policy',
  'channel_command',
])

export const LucidPackResourcePolicySchema = z.enum(['managed', 'fork_on_edit', 'advisory'])
export const LucidPackManagedResourceStatusSchema = z.enum(['active', 'drifted', 'forked', 'archived'])

export const ManagedResourceSpecSchema = z.object({
  key: z.string().min(1).max(160),
  kind: LucidPackResourceKindSchema,
  name: z.string().min(1).max(200),
  policy: LucidPackResourcePolicySchema.default('managed'),
  spec: z.record(z.string(), z.unknown()).default({}),
})

export const LucidPackManifestSchema = z.object({
  schemaVersion: z.literal('2026-05-07.lucid-pack.v1'),
  key: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  version: z.string().min(1).max(80),
  resources: z.array(ManagedResourceSpecSchema).default([]),
  composition: TemplateCompositionSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type LucidPackManifest = z.infer<typeof LucidPackManifestSchema>
export type LucidPackResourceKind = z.infer<typeof LucidPackResourceKindSchema>

export const LucidPackSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid().nullable().optional(),
  packKey: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  version: z.string().min(1).max(80),
  manifest: LucidPackManifestSchema,
  status: z.enum(['active', 'deprecated', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LucidPack = z.infer<typeof LucidPackSchema>

export const LucidPackInstallSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  packId: z.string().uuid(),
  status: z.enum(['active', 'paused', 'archived']),
  config: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LucidPackInstall = z.infer<typeof LucidPackInstallSchema>

export const LucidPackManagedResourceSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  installId: z.string().uuid(),
  resourceKey: z.string().min(1).max(160),
  resourceKind: LucidPackResourceKindSchema,
  resourceId: z.string().max(240).nullable().optional(),
  managementPolicy: LucidPackResourcePolicySchema,
  status: LucidPackManagedResourceStatusSchema,
  lastReconciledAt: z.string().nullable().optional(),
  forkedFromResourceId: z.string().uuid().nullable().optional(),
  forkedAt: z.string().nullable().optional(),
  forkReason: z.string().max(1000).nullable().optional(),
  uninstalledAt: z.string().nullable().optional(),
  uninstallReason: z.string().max(1000).nullable().optional(),
  specHash: z.string().min(16).max(160),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LucidPackManagedResource = z.infer<typeof LucidPackManagedResourceSchema>

export const LucidPackMarketplaceSubmissionStatusSchema = z.enum([
  'draft',
  'submitted',
  'needs_changes',
  'approved',
  'rejected',
  'withdrawn',
])

export const LucidPackMarketplaceSubmissionSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  packId: z.string().uuid(),
  submittedByUserId: z.string().uuid().nullable().optional(),
  status: LucidPackMarketplaceSubmissionStatusSchema,
  reviewNotes: z.string().nullable().optional(),
  qualityReport: z.record(z.string(), z.unknown()).default({}),
  submittedAt: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LucidPackMarketplaceSubmission = z.infer<typeof LucidPackMarketplaceSubmissionSchema>
export type LucidPackMarketplaceSubmissionStatus = z.infer<typeof LucidPackMarketplaceSubmissionStatusSchema>

export const CreateLucidPackSchema = LucidPackSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orgId: z.string().uuid().nullable().optional(),
})

export type CreateLucidPackInput = z.infer<typeof CreateLucidPackSchema>

export const InstallLucidPackRequestSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
})

export type InstallLucidPackRequest = z.infer<typeof InstallLucidPackRequestSchema>

export const UpdateLucidPackInstallRequestSchema = z.object({
  org_id: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'archive', 'uninstall', 'reconcile', 'fork_resource']),
  resource_key: z.string().min(1).max(160).optional(),
  reason: z.string().max(1000).optional(),
})

export type UpdateLucidPackInstallRequest = z.infer<typeof UpdateLucidPackInstallRequestSchema>

export const SubmitLucidPackMarketplaceReviewRequestSchema = z.object({
  org_id: z.string().uuid(),
  pack_id: z.string().uuid(),
  quality_report: z.record(z.string(), z.unknown()).default({}),
  review_notes: z.string().max(4000).nullable().optional(),
})

export type SubmitLucidPackMarketplaceReviewRequest = z.infer<typeof SubmitLucidPackMarketplaceReviewRequestSchema>
