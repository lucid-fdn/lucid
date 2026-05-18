import { describe, expect, it } from 'vitest'

import { resolvePrimaryBlueprintTemplate } from './blueprint-template'

describe('resolvePrimaryBlueprintTemplate', () => {
  it('resolves a blank agent blueprint directly from embedded spec', () => {
    const result = resolvePrimaryBlueprintTemplate({
      version: '1.0',
      project: {
        name: 'Ops Project',
      },
      items: [
        {
          kind: 'agent',
          source: 'blank',
          name: 'Ops Operator',
          spec: {
            kind: 'agent',
            system_prompt: 'Run ops.',
          },
        },
      ],
    })

    expect(result).not.toBeNull()
    expect(result?.name).toBe('Ops Operator')
    expect(result?.spec.kind).toBe('agent')
  })

  it('resolves a template-backed blueprint from the canonical registry', () => {
    const result = resolvePrimaryBlueprintTemplate({
      version: '1.0',
      project: {
        name: 'Support Project',
      },
      items: [
        {
          kind: 'agent',
          source: 'template',
          template_slug: 'support-agent',
          name: 'Support Operator',
        },
      ],
    })

    expect(result).not.toBeNull()
    expect(result?.name).toBe('Support Operator')
    expect(result?.spec.kind).toBe('agent')
    expect(result?.spec).toHaveProperty('system_prompt')
  })
})
