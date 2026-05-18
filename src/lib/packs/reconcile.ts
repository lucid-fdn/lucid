import type {
  LucidPackManagedResource,
  LucidPackManifest,
} from '@contracts/lucid-pack'
import { diffLucidPackResources, type LucidPackResourceDiff } from './diff'
import { hashLucidPackResourceSpec } from './manifest'

export interface LucidPackManagedResourcePatch {
  resourceKey: string
  resourceKind: LucidPackManagedResource['resourceKind']
  managementPolicy: LucidPackManagedResource['managementPolicy']
  status: LucidPackManagedResource['status']
  specHash: string
  metadata: Record<string, unknown>
}

export interface LucidPackReconcilePlan {
  diffs: LucidPackResourceDiff[]
  patches: LucidPackManagedResourcePatch[]
  summary: {
    created: number
    unchanged: number
    updated: number
    drifted: number
    forked: number
    archived: number
  }
}

export function buildLucidPackReconcilePlan(input: {
  manifest: LucidPackManifest
  existingResources: LucidPackManagedResource[]
}): LucidPackReconcilePlan {
  const diffs = diffLucidPackResources({
    manifest: input.manifest,
    existingResources: input.existingResources,
  })
  const existingByKey = new Map(input.existingResources.map((resource) => [resource.resourceKey, resource]))
  const desiredByKey = new Map(input.manifest.resources.map((resource) => [resource.key, resource]))

  const patches = diffs.map((diff): LucidPackManagedResourcePatch => {
    const desired = desiredByKey.get(diff.resourceKey)
    const existing = existingByKey.get(diff.resourceKey)
    const desiredHash = desired ? hashLucidPackResourceSpec(desired.spec) : null
    const keepExistingSpecHash = diff.action === 'mark_drifted' || diff.action === 'mark_forked'
    return {
      resourceKey: diff.resourceKey,
      resourceKind: desired?.kind ?? existing?.resourceKind ?? 'policy',
      managementPolicy: desired?.policy ?? existing?.managementPolicy ?? 'advisory',
      status: diff.status,
      specHash: keepExistingSpecHash
        ? existing?.specHash ?? desiredHash ?? ''
        : desiredHash ?? existing?.specHash ?? '',
      metadata: {
        name: desired?.name ?? existing?.metadata.name ?? diff.resourceKey,
        desired_spec_hash: desiredHash,
        previous_spec_hash: existing?.specHash ?? null,
        reconcile_action: diff.action,
        reconcile_reason: diff.reason,
        pack_resource_kind: desired?.kind ?? existing?.resourceKind ?? null,
      },
    }
  })

  return {
    diffs,
    patches,
    summary: {
      created: diffs.filter((diff) => diff.action === 'create').length,
      unchanged: diffs.filter((diff) => diff.action === 'noop').length,
      updated: diffs.filter((diff) => diff.action === 'update_managed').length,
      drifted: diffs.filter((diff) => diff.action === 'mark_drifted').length,
      forked: diffs.filter((diff) => diff.action === 'mark_forked').length,
      archived: diffs.filter((diff) => diff.action === 'archive_removed').length,
    },
  }
}
