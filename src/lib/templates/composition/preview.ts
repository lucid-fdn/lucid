import type { LucidPackResourceKind } from '@contracts/lucid-pack'
import { buildLucidPackReconcilePlan } from '@/lib/packs'
import {
  getExistingResourceCapabilityKeys,
  isHighRiskCapability,
  normalizeCapabilityTemplateComposition,
} from './normalize'
import type {
  BuildCapabilityTemplatePreviewInput,
  CapabilityTemplateApprovalRequirement,
  CapabilityTemplateInstallPreview,
  CapabilityTemplatePreviewConflict,
  CapabilityTemplatePreviewResource,
  CapabilityTemplatePreviewResourceAction,
  CapabilityTemplateRequiredSetup,
} from './types'

export function buildCapabilityTemplateInstallPreview(
  input: BuildCapabilityTemplatePreviewInput,
): CapabilityTemplateInstallPreview {
  const composition = normalizeCapabilityTemplateComposition(input.manifest)
  const plan = buildLucidPackReconcilePlan({
    manifest: input.manifest,
    existingResources: input.existingResources,
  })
  const desiredByKey = new Map(input.manifest.resources.map((resource) => [resource.key, resource]))
  const existingCapabilityKeys = getExistingResourceCapabilityKeys(input.existingResources)
  const providedCapabilityKeys = new Set(composition.provides.map((capability) => capability.key))

  const resources = plan.diffs.map((diff): CapabilityTemplatePreviewResource => {
    const desired = desiredByKey.get(diff.resourceKey)
    return {
      resourceKey: diff.resourceKey,
      resourceKind: desired?.kind ?? 'policy',
      name: desired?.name ?? diff.resourceKey,
      action: mapDiffAction(diff.action),
      policy: desired?.policy ?? 'advisory',
      desiredSpecHash: diff.desiredSpecHash,
      currentSpecHash: diff.currentSpecHash,
      reason: diff.reason,
    }
  })

  const conflicts: CapabilityTemplatePreviewConflict[] = composition.conflicts
    .filter((conflict) => existingCapabilityKeys.has(conflict.capability))
    .map((conflict) => ({
      capability: conflict.capability,
      mode: conflict.mode,
      reason: conflict.reason,
      blocking: conflict.mode === 'exclusive',
    }))

  const requiredSetup: CapabilityTemplateRequiredSetup[] = [
    ...composition.requires.filter((dependency) => !existingCapabilityKeys.has(dependency.capability) && !providedCapabilityKeys.has(dependency.capability)),
    ...composition.optional.filter((dependency) => !existingCapabilityKeys.has(dependency.capability) && !providedCapabilityKeys.has(dependency.capability)),
  ].map((dependency) => ({
    capability: dependency.capability,
    required: dependency.required,
    acceptedProviders: dependency.acceptedProviders,
    reason: dependency.reason ?? `${dependency.required ? 'Required' : 'Optional'} capability is not configured yet.`,
  }))

  const approvals: CapabilityTemplateApprovalRequirement[] = composition.provides
    .filter(isHighRiskCapability)
    .filter(() => !manifestHasApprovalPolicy(input.manifest.resources))
    .map((capability) => ({
      capability: capability.key,
      risk: capability.risk,
      reason: 'High-risk capability needs an explicit approval policy before it can be ready.',
    }))

  const warnings = [
    ...composition.provides
      .filter((capability) => capability.risk === 'medium')
      .map((capability) => `${capability.name} is medium risk and should be reviewed before enabling automation.`),
    ...conflicts.filter((conflict) => !conflict.blocking).map((conflict) => conflict.reason),
  ]

  const creates = resources.filter((resource) => resource.action === 'create')
  const reuses = resources.filter((resource) => resource.action === 'reuse')
  const updates = resources.filter((resource) => resource.action === 'update')
  const forks = resources.filter((resource) => resource.action === 'fork' || resource.action === 'review')
  const archives = resources.filter((resource) => resource.action === 'archive')
  const blockingRequiredSetup = requiredSetup.filter((setup) => setup.required)
  const blockingConflicts = conflicts.filter((conflict) => conflict.blocking)
  const status = blockingConflicts.length > 0
    ? 'blocked'
    : blockingRequiredSetup.length > 0 || approvals.length > 0
      ? 'needs_setup'
      : 'ready'

  return {
    templateId: input.packId,
    templateKey: input.manifest.key,
    backingPackId: input.packId,
    backingPackKey: input.manifest.key,
    status,
    creates,
    reuses,
    updates,
    forks,
    archives,
    conflicts,
    requiredSetup,
    approvals,
    warnings,
    summary: {
      creates: creates.length,
      reuses: reuses.length,
      updates: updates.length,
      forks: forks.length,
      archives: archives.length,
      conflicts: conflicts.length,
      requiredSetup: requiredSetup.length,
      approvals: approvals.length,
    },
  }
}

function mapDiffAction(action: string): CapabilityTemplatePreviewResourceAction {
  if (action === 'create') return 'create'
  if (action === 'noop') return 'reuse'
  if (action === 'update_managed') return 'update'
  if (action === 'mark_forked') return 'fork'
  if (action === 'mark_drifted') return 'review'
  if (action === 'archive_removed') return 'archive'
  return 'review'
}

function manifestHasApprovalPolicy(resources: Array<{ kind: LucidPackResourceKind; spec: Record<string, unknown> }>): boolean {
  return resources.some((resource) => {
    if (resource.kind !== 'policy') return false
    return resource.spec.approval_required === true
      || resource.spec.requires_approval === true
      || resource.spec.high_risk_approval === true
      || resource.spec.policy_type === 'approval'
  })
}
