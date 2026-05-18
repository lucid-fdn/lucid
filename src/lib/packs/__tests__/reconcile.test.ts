import { describe, expect, it } from 'vitest'

import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { hashLucidPackResourceSpec } from '../manifest'
import { buildLucidPackReconcilePlan } from '../reconcile'
import { summarizeLucidPackInstallHealth } from '../install'

const manifest: LucidPackManifest = {
  schemaVersion: '2026-05-07.lucid-pack.v1',
  key: 'sales-ops',
  name: 'Sales Ops',
  description: 'Sales operating pack.',
  version: '1.0.0',
  resources: [
    {
      key: 'agent:sdr',
      kind: 'agent',
      name: 'SDR Agent',
      policy: 'managed',
      spec: { prompt: 'Qualify accounts.' },
    },
    {
      key: 'doc:playbook',
      kind: 'doc',
      name: 'Sales playbook',
      policy: 'fork_on_edit',
      spec: { title: 'Playbook', sections: ['Discovery'] },
    },
    {
      key: 'policy:handoff',
      kind: 'policy',
      name: 'Handoff policy',
      policy: 'advisory',
      spec: { rule: 'Escalate enterprise leads.' },
    },
  ],
  metadata: {},
}

function resource(input: Partial<LucidPackManagedResource> & Pick<LucidPackManagedResource, 'resourceKey' | 'specHash'>): LucidPackManagedResource {
  return {
    id: `${input.resourceKey}-id`,
    orgId: '22222222-2222-4222-8222-222222222222',
    installId: '33333333-3333-4333-8333-333333333333',
    resourceKey: input.resourceKey,
    resourceKind: input.resourceKind ?? 'policy',
    resourceId: null,
    managementPolicy: input.managementPolicy ?? 'managed',
    status: input.status ?? 'active',
    lastReconciledAt: null,
    specHash: input.specHash,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('Lucid pack reconcile', () => {
  it('plans install, managed update, fork, drift, and archive actions deterministically', () => {
    const currentManagedHash = hashLucidPackResourceSpec({ prompt: 'Old prompt.' })
    const currentForkHash = hashLucidPackResourceSpec({ title: 'Local playbook', sections: ['Local edits'] })
    const currentAdvisoryHash = hashLucidPackResourceSpec({ rule: 'Old handoff.' })
    const removedHash = hashLucidPackResourceSpec({ removed: true })

    const plan = buildLucidPackReconcilePlan({
      manifest,
      existingResources: [
        resource({ resourceKey: 'agent:sdr', resourceKind: 'agent', managementPolicy: 'managed', specHash: currentManagedHash }),
        resource({ resourceKey: 'doc:playbook', resourceKind: 'doc', managementPolicy: 'fork_on_edit', specHash: currentForkHash }),
        resource({ resourceKey: 'policy:handoff', resourceKind: 'policy', managementPolicy: 'advisory', specHash: currentAdvisoryHash }),
        resource({ resourceKey: 'workflow:removed', resourceKind: 'workflow', managementPolicy: 'managed', specHash: removedHash }),
      ],
    })

    expect(plan.summary).toEqual({
      created: 0,
      unchanged: 0,
      updated: 1,
      drifted: 1,
      forked: 1,
      archived: 1,
    })
    expect(plan.diffs.map((diff) => diff.action)).toEqual(
      expect.arrayContaining(['update_managed', 'mark_forked', 'mark_drifted', 'archive_removed']),
    )
    expect(plan.patches.find((patch) => patch.resourceKey === 'doc:playbook')?.status).toBe('forked')
    expect(plan.patches.find((patch) => patch.resourceKey === 'policy:handoff')?.status).toBe('drifted')
    expect(plan.patches.find((patch) => patch.resourceKey === 'workflow:removed')?.status).toBe('archived')
  })

  it('summarizes install health for Mission Control', () => {
    const health = summarizeLucidPackInstallHealth({
      install: { status: 'active' },
      resources: [
        { status: 'active' },
        { status: 'forked' },
      ],
    })

    expect(health.status).toBe('needs_review')
    expect(health.forked).toBe(1)
  })
})
