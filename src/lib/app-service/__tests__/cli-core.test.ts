import { describe, expect, it } from 'vitest'
import { parseAppServiceCliArgs } from '../../../../scripts/lucid-app-service'

describe('lucid app service cli parser', () => {
  it('parses repeated capabilities for token creation', () => {
    expect(parseAppServiceCliArgs([
      'token',
      'create',
      '--app-id',
      'app',
      '--capability',
      'chat',
      '--capability',
      'lead',
    ])).toEqual({
      command: ['token', 'create'],
      flags: {
        'app-id': 'app',
        capability: ['chat', 'lead'],
      },
    })
  })
})
