import type {
  LucidPack,
  LucidPackInstall,
  LucidPackManagedResource,
  LucidPackManifest,
} from '@contracts/lucid-pack'
import type { DeployTemplateResult } from '@contracts/template'

export type CapabilityTemplateProvisionStatus = 'provisioned' | 'registered' | 'needs_setup' | 'skipped' | 'failed'

export interface CapabilityTemplateProvisionResult {
  resourceKey: string
  resourceKind: LucidPackManagedResource['resourceKind']
  status: CapabilityTemplateProvisionStatus
  resourceId: string | null
  message: string
  details?: {
    deploymentResult?: DeployTemplateResult
  }
}

export interface CapabilityTemplateProvisionSummary {
  provisioned: number
  registered: number
  needsSetup: number
  skipped: number
  failed: number
}

export interface CapabilityTemplateProvisionReport {
  install: LucidPackInstall
  pack: LucidPack
  results: CapabilityTemplateProvisionResult[]
  summary: CapabilityTemplateProvisionSummary
}

export interface CapabilityTemplateProvisionContext {
  orgId: string
  install: LucidPackInstall
  pack: LucidPack
  manifest: LucidPackManifest
  resources: LucidPackManagedResource[]
  userId?: string | null
}
