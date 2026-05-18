import type { LucidPackManagedResource, LucidPackManifest, LucidPackResourceKind } from '@contracts/lucid-pack'
import type { TemplateCapability, TemplateCapabilityRisk, TemplateConflict, TemplateDependency } from '@contracts/template-composition'
import type { LucidPackResourceDiffAction } from '@/lib/packs'

export type CapabilityTemplateInstallPreviewStatus = 'ready' | 'needs_setup' | 'blocked'
export type CapabilityTemplatePreviewResourceAction = 'create' | 'reuse' | 'update' | 'fork' | 'archive' | 'review'

export interface CapabilityTemplatePreviewResource {
  resourceKey: string
  resourceKind: LucidPackResourceKind
  name: string
  action: CapabilityTemplatePreviewResourceAction
  policy: 'managed' | 'fork_on_edit' | 'advisory'
  desiredSpecHash: string | null
  currentSpecHash: string | null
  reason: string
}

export interface CapabilityTemplatePreviewConflict {
  capability: string
  mode: TemplateConflict['mode']
  reason: string
  blocking: boolean
}

export interface CapabilityTemplateRequiredSetup {
  capability: string
  required: boolean
  acceptedProviders: string[]
  reason: string
}

export interface CapabilityTemplateApprovalRequirement {
  capability: string
  risk: TemplateCapabilityRisk
  reason: string
}

export interface CapabilityTemplateInstallPreview {
  templateId: string
  templateKey: string
  backingPackId: string
  backingPackKey: string
  status: CapabilityTemplateInstallPreviewStatus
  creates: CapabilityTemplatePreviewResource[]
  reuses: CapabilityTemplatePreviewResource[]
  updates: CapabilityTemplatePreviewResource[]
  forks: CapabilityTemplatePreviewResource[]
  archives: CapabilityTemplatePreviewResource[]
  conflicts: CapabilityTemplatePreviewConflict[]
  requiredSetup: CapabilityTemplateRequiredSetup[]
  approvals: CapabilityTemplateApprovalRequirement[]
  warnings: string[]
  summary: {
    creates: number
    reuses: number
    updates: number
    forks: number
    archives: number
    conflicts: number
    requiredSetup: number
    approvals: number
  }
}

export interface BuildCapabilityTemplatePreviewInput {
  packId: string
  manifest: LucidPackManifest
  existingResources: LucidPackManagedResource[]
}

export interface NormalizedCapabilityTemplateComposition {
  provides: TemplateCapability[]
  requires: TemplateDependency[]
  optional: TemplateDependency[]
  conflicts: TemplateConflict[]
  upgradesFrom: string[]
  tags: string[]
}

export interface ResourceDiffView {
  resourceKey: string
  action: LucidPackResourceDiffAction
  desiredSpecHash: string | null
  currentSpecHash: string | null
  reason: string
}
