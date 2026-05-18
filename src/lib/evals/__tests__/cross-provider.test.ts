import { describe, expect, it } from 'vitest'

import {
  runCrossProviderEval,
  type CrossProviderEvalJudgeProvider,
} from '../cross-provider'

const orgId = '22222222-2222-4222-8222-222222222222'

function provider(
  name: string,
  scores: Record<string, number> | Error,
  estimateCostUsd = 0,
): CrossProviderEvalJudgeProvider {
  return {
    providerClass: name,
    model: `${name}-model`,
    estimateCostUsd: () => estimateCostUsd,
    async judge() {
      if (scores instanceof Error) throw scores
      return { scores }
    },
  }
}

describe('runCrossProviderEval', () => {
  it('marks all-provider failure as inconclusive', async () => {
    const result = await runCrossProviderEval({
      orgId,
      sourceType: 'manual',
      sourceId: 'manual-1',
      task: 'Judge this output',
      output: 'Useful output with evidence.',
      dimensions: ['correctness', 'evidence'],
      providers: [
        provider('openai', new Error('provider down')),
        provider('anthropic', new Error('quota exceeded')),
      ],
    })

    expect(result.receiptInput.verdict).toBe('inconclusive')
    expect(result.successfulJudgeCount).toBe(0)
    expect(result.failedJudgeCount).toBe(2)
    expect(result.receiptInput.judges.every((judge) => !judge.ok)).toBe(true)
  })

  it('allows one provider failure when enough judges succeed', async () => {
    const result = await runCrossProviderEval({
      orgId,
      sourceType: 'agent_ops_run',
      sourceId: 'run-1',
      task: 'Review output quality',
      output: 'The run summary is complete and cites evidence because logs passed.',
      dimensions: ['correctness', 'evidence'],
      minSuccessfulJudges: 2,
      passThreshold: 7,
      providers: [
        provider('openai', { correctness: 8, evidence: 8 }),
        provider('google', { correctness: 7.5, evidence: 7.2 }),
        provider('anthropic', new Error('temporary outage')),
      ],
    })

    expect(result.receiptInput.verdict).toBe('pass')
    expect(result.successfulJudgeCount).toBe(2)
    expect(result.failedJudgeCount).toBe(1)
    expect(result.receiptInput.aggregate).toMatchObject({
      authoritative: true,
      successfulJudgeCount: 2,
      failedJudgeCount: 1,
    })
  })

  it('enforces cost caps before running judges', async () => {
    const result = await runCrossProviderEval({
      orgId,
      sourceType: 'knowledge_think',
      sourceId: 'think-1',
      task: 'Judge synthesis quality',
      output: 'A synthesis answer.',
      dimensions: ['correctness'],
      minSuccessfulJudges: 2,
      costCapUsd: 0.01,
      providers: [
        provider('openai', { correctness: 9 }, 0.01),
        provider('anthropic', { correctness: 9 }, 0.02),
      ],
    })

    expect(result.receiptInput.verdict).toBe('inconclusive')
    expect(result.successfulJudgeCount).toBe(1)
    expect(result.skippedJudgeCount).toBe(1)
    expect(result.receiptInput.judges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerClass: 'anthropic',
        ok: false,
        error: 'cost_cap_exceeded',
      }),
    ]))
    expect(result.receiptInput.aggregate).toMatchObject({
      costCapExceeded: true,
      estimatedCostUsd: 0.01,
    })
  })

  it('fails authoritatively when successful judges score below threshold', async () => {
    const result = await runCrossProviderEval({
      orgId,
      sourceType: 'browser_procedure',
      sourceId: 'procedure-1',
      task: 'Judge promotion readiness',
      output: 'No evidence was captured.',
      dimensions: ['correctness', 'evidence'],
      minSuccessfulJudges: 2,
      passThreshold: 7,
      providers: [
        provider('openai', { correctness: 7.5, evidence: 4 }),
        provider('google', { correctness: 8, evidence: 5 }),
      ],
    })

    expect(result.receiptInput.verdict).toBe('fail')
    expect(result.receiptInput.aggregate).toMatchObject({
      authoritative: true,
      dimensionAverages: {
        correctness: 7.75,
        evidence: 4.5,
      },
    })
  })
})
