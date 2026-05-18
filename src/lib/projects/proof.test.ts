import { describe, expect, it } from 'vitest'
import { deriveProjectProofLoop } from './proof'

describe('deriveProjectProofLoop', () => {
  const runtimePackaging = {
    uniqueModeCount: 1,
    primaryTitle: 'Shared runtime',
    guidance: 'This surface is operationally simple: runtime ownership and escalation paths stay consistent.',
  }

  it('starts with create-agent when the project is empty', () => {
    const loop = deriveProjectProofLoop({
      assistantCount: 0,
      recentEventCount: 0,
      attention: {
        approvals: 0,
        failedRuns: 0,
        openWorkItems: 0,
        readyWorkItems: 0,
      },
      runtimePackaging,
    })

    expect(loop.stage).toBe('create-agent')
    expect(loop.nextActionTitle).toBe('Create your first agent')
  })

  it('moves to create-work once agents exist', () => {
    const loop = deriveProjectProofLoop({
      assistantCount: 1,
      recentEventCount: 0,
      attention: {
        approvals: 0,
        failedRuns: 0,
        openWorkItems: 0,
        readyWorkItems: 0,
      },
      runtimePackaging,
    })

    expect(loop.stage).toBe('create-work')
    expect(loop.nextActionTitle).toBe('Create one work item')
  })

  it('moves to inbox review when there is real operator state', () => {
    const loop = deriveProjectProofLoop({
      assistantCount: 2,
      recentEventCount: 4,
      attention: {
        approvals: 1,
        failedRuns: 0,
        openWorkItems: 2,
        readyWorkItems: 1,
      },
      runtimePackaging,
    })

    expect(loop.stage).toBe('review-inbox')
    expect(loop.receiptLabel).toBe('4 recent receipts')
  })
})
