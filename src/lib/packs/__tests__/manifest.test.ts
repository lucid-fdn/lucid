import { describe, expect, it } from 'vitest'

import {
  assertLucidPackManifestSafe,
  hashLucidPackResourceSpec,
  stableJson,
  validateLucidPackManifestSafety,
} from '../manifest'
import type { LucidPackManifest } from '@contracts/lucid-pack'

const baseManifest: LucidPackManifest = {
  schemaVersion: '2026-05-07.lucid-pack.v1',
  key: 'launch-readiness',
  name: 'Launch Readiness',
  description: 'Agent Ops launch readiness bundle.',
  version: '1.0.0',
  resources: [
    {
      key: 'workflow:check-page',
      kind: 'workflow',
      name: 'Check page',
      policy: 'managed',
      spec: {
        workflow_id: 'check-page',
        required_capabilities: ['browser.session'],
        provider_api_key: 'secret://providers/browser-operator',
      },
    },
  ],
  metadata: {},
}

describe('Lucid pack manifest safety', () => {
  it('allows secret references but rejects embedded secret literals', () => {
    expect(validateLucidPackManifestSafety(baseManifest)).toEqual([])
    const unsafe: LucidPackManifest = {
      ...baseManifest,
      resources: [{
        ...baseManifest.resources[0]!,
        spec: {
          api_key: 'sk-proj-this_should_never_ship_abcdefghijklmnopqrstuvwxyz',
        },
      }],
    }

    expect(() => assertLucidPackManifestSafe(unsafe)).toThrow(/unsafe secret material/)
    expect(validateLucidPackManifestSafety(unsafe)[0]).toMatchObject({
      path: 'resources[0].spec.api_key',
      reason: 'embedded_secret',
    })
  })

  it('hashes resource specs deterministically', () => {
    const left = { b: 1, a: { z: true, y: ['x'] } }
    const right = { a: { y: ['x'], z: true }, b: 1 }

    expect(stableJson(left)).toBe(stableJson(right))
    expect(hashLucidPackResourceSpec(left)).toBe(hashLucidPackResourceSpec(right))
  })
})
