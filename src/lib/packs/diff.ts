import type {
  LucidPackManagedResource,
  LucidPackManifest,
} from '@contracts/lucid-pack'
import { hashLucidPackResourceSpec } from './manifest'

export type LucidPackResourceDiffAction =
  | 'create'
  | 'noop'
  | 'update_managed'
  | 'mark_drifted'
  | 'mark_forked'
  | 'archive_removed'

export interface LucidPackResourceDiff {
  resourceKey: string
  action: LucidPackResourceDiffAction
  desiredSpecHash: string | null
  currentSpecHash: string | null
  status: LucidPackManagedResource['status']
  reason: string
}

export function diffLucidPackResources(input: {
  manifest: LucidPackManifest
  existingResources: Array<Pick<
    LucidPackManagedResource,
    'resourceKey' | 'specHash' | 'managementPolicy' | 'status'
  >>
}): LucidPackResourceDiff[] {
  const existingByKey = new Map(input.existingResources.map((resource) => [resource.resourceKey, resource]))
  const desiredByKey = new Map(input.manifest.resources.map((resource) => [resource.key, resource]))
  const diffs: LucidPackResourceDiff[] = []

  for (const resource of input.manifest.resources) {
    const desiredSpecHash = hashLucidPackResourceSpec(resource.spec)
    const existing = existingByKey.get(resource.key)
    if (!existing) {
      diffs.push({
        resourceKey: resource.key,
        action: 'create',
        desiredSpecHash,
        currentSpecHash: null,
        status: 'active',
        reason: 'Resource is declared by the pack but not installed yet.',
      })
      continue
    }
    if (existing.status === 'archived') {
      diffs.push({
        resourceKey: resource.key,
        action: 'create',
        desiredSpecHash,
        currentSpecHash: existing.specHash,
        status: 'active',
        reason: 'Resource was archived locally and should be recreated from the pack.',
      })
      continue
    }
    if (existing.specHash === desiredSpecHash) {
      diffs.push({
        resourceKey: resource.key,
        action: 'noop',
        desiredSpecHash,
        currentSpecHash: existing.specHash,
        status: 'active',
        reason: 'Resource already matches the pack manifest.',
      })
      continue
    }

    if (resource.policy === 'managed') {
      diffs.push({
        resourceKey: resource.key,
        action: 'update_managed',
        desiredSpecHash,
        currentSpecHash: existing.specHash,
        status: 'active',
        reason: 'Managed resource can be updated to the pack manifest.',
      })
    } else if (resource.policy === 'fork_on_edit') {
      diffs.push({
        resourceKey: resource.key,
        action: 'mark_forked',
        desiredSpecHash,
        currentSpecHash: existing.specHash,
        status: 'forked',
        reason: 'Local resource diverged and the pack policy protects user edits by forking.',
      })
    } else {
      diffs.push({
        resourceKey: resource.key,
        action: 'mark_drifted',
        desiredSpecHash,
        currentSpecHash: existing.specHash,
        status: 'drifted',
        reason: 'Advisory resource differs from the pack manifest and needs operator review.',
      })
    }
  }

  for (const existing of input.existingResources) {
    if (desiredByKey.has(existing.resourceKey) || existing.status === 'archived') continue
    diffs.push({
      resourceKey: existing.resourceKey,
      action: 'archive_removed',
      desiredSpecHash: null,
      currentSpecHash: existing.specHash,
      status: 'archived',
      reason: 'Resource no longer exists in the pack manifest and should be archived, not deleted.',
    })
  }

  return diffs
}
