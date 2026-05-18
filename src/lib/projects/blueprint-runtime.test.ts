import { describe, expect, it } from 'vitest'

import { resolveBlueprintRuntime } from '@/lib/projects/blueprint-runtime'

describe('resolveBlueprintRuntime', () => {
  it('maps shared engine runtime without assigning a dedicated runtime id', () => {
    expect(resolveBlueprintRuntime({
      mode: 'shared',
      engine: 'openclaw',
      runtime_id: '11111111-1111-4111-8111-111111111111',
    })).toEqual({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
    })
  })

  it('maps dedicated and byo runtime modes to runtime flavors', () => {
    expect(resolveBlueprintRuntime({
      mode: 'dedicated',
      engine: 'hermes',
      runtime_id: '22222222-2222-4222-8222-222222222222',
    })).toEqual({
      runtimeId: '22222222-2222-4222-8222-222222222222',
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
    })

    expect(resolveBlueprintRuntime({
      mode: 'byo',
      engine: 'hermes',
      runtime_id: '33333333-3333-4333-8333-333333333333',
    })).toEqual({
      runtimeId: '33333333-3333-4333-8333-333333333333',
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
    })
  })

  it('keeps legacy route-level runtime id behavior explicit', () => {
    expect(resolveBlueprintRuntime(undefined, '44444444-4444-4444-8444-444444444444')).toEqual({
      runtimeId: '44444444-4444-4444-8444-444444444444',
      runtimeFlavor: 'c1_managed',
    })
  })

  it('lets an explicit route-level runtime id override shared blueprint mode', () => {
    expect(resolveBlueprintRuntime({
      mode: 'shared',
      engine: 'openclaw',
    }, '55555555-5555-4555-8555-555555555555')).toEqual({
      runtimeId: '55555555-5555-4555-8555-555555555555',
      engine: 'openclaw',
      runtimeFlavor: 'c1_managed',
    })
  })
})
