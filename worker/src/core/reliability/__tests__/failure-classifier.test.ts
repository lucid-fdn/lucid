import { describe, expect, it } from 'vitest'

import { classifyMessageFailure } from '../failure-classifier.js'

describe('classifyMessageFailure', () => {
  it('marks policy failures as non-retryable', () => {
    expect(
      classifyMessageFailure({
        stage: 'policy',
        error: new Error('blocked'),
      }),
    ).toEqual({
      kind: 'policy_blocked',
      retryable: false,
      message: 'blocked',
    })
  })

  it('marks outbound send failures as retryable by default', () => {
    expect(
      classifyMessageFailure({
        stage: 'outbound_send',
        error: 'send failed',
      }),
    ).toEqual({
      kind: 'outbound_send_failed',
      retryable: true,
      message: 'send failed',
    })
  })
})
