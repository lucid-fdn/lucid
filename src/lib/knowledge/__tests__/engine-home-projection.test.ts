import { describe, expect, it } from 'vitest'
import type { EngineHomeSnapshot } from '@lucid/runtime-compat'

import {
  buildEngineHomeProjectionCandidates,
  classifyEngineHomeResource,
  getEngineHomeDisplayLabel,
  resolveEngineHomeProjectionPolicy,
} from '../engine-home-projection'

describe('engine-home projection policy', () => {
  it('classifies Hermes memory, user, local skills, config, sessions, and cache resources', () => {
    expect(classifyEngineHomeResource({ path: 'memories/MEMORY.md' })).toBe('memory')
    expect(classifyEngineHomeResource({ path: 'memories/USER.md' })).toBe('user_profile')
    expect(classifyEngineHomeResource({ path: 'skills/research/SKILL.md' })).toBe('local_skill')
    expect(classifyEngineHomeResource({ path: 'config/settings.json' })).toBe('config')
    expect(classifyEngineHomeResource({ path: 'sessions/run-1.json' })).toBe('session')
    expect(classifyEngineHomeResource({ path: 'cache/index.sqlite' })).toBe('cache')
  })

  it('keeps Hermes local-authoritative memory as review candidates, not automatic Lucid Knowledge', () => {
    expect(resolveEngineHomeProjectionPolicy({
      engine: 'hermes',
      authority: 'local_authoritative',
      resourceType: 'memory',
      options: { allowHermesAutoPromotion: true },
    })).toBe('candidate_only')
  })

  it('keeps OpenClaw OHV evaluation/export-only unless explicitly enabled', () => {
    expect(resolveEngineHomeProjectionPolicy({
      engine: 'openclaw',
      authority: 'evaluation_only',
      resourceType: 'memory',
    })).toBe('export_only')

    expect(resolveEngineHomeProjectionPolicy({
      engine: 'openclaw',
      authority: 'evaluation_only',
      resourceType: 'memory',
      options: { allowOpenClawProjection: true },
    })).toBe('searchable_summary')
  })

  it('builds redacted, provenanced HHV candidates without raw content payloads', () => {
    const candidates = buildEngineHomeProjectionCandidates(snapshot())

    expect(candidates).toHaveLength(3)
    expect(candidates[0]).toMatchObject({
      orgId: '22222222-2222-4222-8222-222222222222',
      engine: 'hermes',
      homeKind: 'hermes_hhv',
      homeAuthority: 'local_authoritative',
      resourceType: 'memory',
      projectionPolicy: 'candidate_only',
      status: 'candidate',
      path: 'memories/memory.md',
      sourceSnapshotId: 'snapshot-1',
    })
    expect(JSON.stringify(candidates[0]?.payloadRedacted)).not.toContain('Customer prefers')
    expect(candidates[0]?.summary).toContain('Customer prefers')
    expect(candidates[2]?.resourceType).toBe('cache')
    expect(candidates[2]?.status).toBe('ignored')
  })

  it('distinguishes product labels from engine memory labels', () => {
    expect(getEngineHomeDisplayLabel({ engine: 'hermes' })).toBe('Hermes memory')
    expect(getEngineHomeDisplayLabel({ engine: 'openclaw' })).toBe('OpenClaw memory')
    expect(getEngineHomeDisplayLabel({ engine: 'lucid' })).toBe('Engine memory')
  })
})

function snapshot(): EngineHomeSnapshot {
  return {
    id: 'snapshot-1',
    orgId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    descriptor: {
      engine: 'hermes',
      kind: 'hermes_hhv',
      authority: 'local_authoritative',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'lucid_relay',
      runtimeId: '55555555-5555-4555-8555-555555555555',
      assistantId: '44444444-4444-4444-8444-444444444444',
      homePath: '/home/hermes/.hermes',
    },
    resources: [
      {
        path: 'memories/MEMORY.md',
        content: '# Memory\nCustomer prefers weekly proof summaries.',
      },
      {
        path: 'skills/research/SKILL.md',
        content: '# Research\n---\ndescription: Search and summarize evidence.\n---',
      },
      {
        path: 'cache/index.sqlite',
        content: 'opaque cache',
      },
    ],
    createdAt: '2026-05-06T00:00:00.000Z',
    diffId: 'diff-1',
  }
}
