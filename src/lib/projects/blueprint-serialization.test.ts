import { describe, expect, it } from 'vitest'

import type { ProjectBlueprint } from '@contracts/project-blueprint'

import {
  parseProjectBlueprint,
  serializeProjectBlueprint,
} from './blueprint-serialization'

const blueprint: ProjectBlueprint = {
  version: '1.0',
  project: {
    name: 'Support Ops',
    description: 'Owns support automation',
  },
  items: [
    {
      kind: 'agent',
      source: 'blank',
      name: 'Support Agent',
      runtime: {
        mode: 'shared',
        engine: 'openclaw',
      },
      spec: {
        kind: 'agent',
        system_prompt: 'Handle support issues clearly and escalate when needed.',
      },
    },
  ],
}

describe('blueprint serialization', () => {
  it('round-trips JSON through the canonical schema', () => {
    const serialized = serializeProjectBlueprint(blueprint, 'json')
    expect(parseProjectBlueprint(serialized, 'json')).toEqual(blueprint)
  })

  it('round-trips YAML through the canonical schema', () => {
    const serialized = serializeProjectBlueprint(blueprint, 'yaml')
    expect(parseProjectBlueprint(serialized, 'yaml')).toEqual(blueprint)
  })

  it('rejects invalid YAML with a parse error', () => {
    expect(() => parseProjectBlueprint('project: [', 'yaml')).toThrow()
  })
})
