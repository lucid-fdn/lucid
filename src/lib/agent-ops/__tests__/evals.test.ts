import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsBenchmarkMatrix,
  buildBenchmarkEvalResults,
  buildModelBenchmarkKey,
  buildEvalScenarioResults,
  calculateWeightedEvalScore,
  listBuiltInEvalScenarios,
  summarizeBenchmarkObservations,
  summarizeEvalResults,
} from '../evals'

describe('Agent Ops evals', () => {
  it('calculates weighted scores across metrics', () => {
    expect(calculateWeightedEvalScore([
      { name: 'quality', score: 90, weight: 0.7 },
      { name: 'latency', score: 60, weight: 0.3 },
    ])).toBeCloseTo(81)
  })

  it('summarizes pass rate and score for completed eval results', () => {
    const summary = summarizeEvalResults([
      {
        scenarioSlug: 'release-gates',
        status: 'passed',
        score: 90,
        summary: 'Good',
      },
      {
        scenarioSlug: 'canary-signal',
        status: 'failed',
        score: 40,
        summary: 'Missing rollback criteria',
      },
      {
        scenarioSlug: 'manual-review',
        status: 'skipped',
        summary: 'Not applicable',
      },
    ])

    expect(summary.resultCount).toBe(3)
    expect(summary.failedCount).toBe(1)
    expect(summary.skippedCount).toBe(1)
    expect(summary.passRate).toBe(50)
    expect(summary.score).toBeCloseTo(65)
  })

  it('builds deterministic benchmark keys', () => {
    expect(buildModelBenchmarkKey({
      provider: 'OpenAI',
      model: 'GPT-5.2',
      scenario: ' Release Gates ',
    })).toBe('openai:gpt-5.2:release-gates')
  })

  it('ships built-in model, channel, and memory eval packs', () => {
    expect(listBuiltInEvalScenarios('model_benchmark').map((scenario) => scenario.slug)).toContain('instruction-following')
    expect(listBuiltInEvalScenarios('model_benchmark').map((scenario) => scenario.slug)).toContain('procedure-quality-lift')
    expect(listBuiltInEvalScenarios('model_benchmark').map((scenario) => scenario.slug)).toContain('runtime-compatibility')
    expect(listBuiltInEvalScenarios('channel_ux').map((scenario) => scenario.slug)).toContain('streaming-visible')
    expect(listBuiltInEvalScenarios('memory_recall').map((scenario) => scenario.slug)).toContain('cross-channel-continuity')

    const results = buildEvalScenarioResults({
      packKind: 'memory_recall',
      status: 'warning',
      defaultScore: 70,
      evidence: { source: 'smoke' },
    })

    expect(results).toHaveLength(listBuiltInEvalScenarios('memory_recall').length)
    expect(results[0]).toMatchObject({
      status: 'warning',
      score: 70,
      evidence: { source: 'smoke' },
      metadata: { pack_kind: 'memory_recall' },
    })
  })

  it('builds a benchmark matrix across model, runtime, channel, memory, and Browser Operator mode', () => {
    const matrix = buildAgentOpsBenchmarkMatrix({
      workflowId: 'check-page',
      scenario: 'pricing page',
      models: ['gpt-5.2', 'gpt-5.4'],
      runtimeProfiles: ['shared'],
      channels: ['web', 'slack'],
      memoryModes: ['off', 'semantic'],
      browserModes: ['generic_browser_operator', 'browser_procedure'],
      browserProcedureId: 'procedure-1',
    })

    expect(matrix.candidates).toHaveLength(16)
    expect(matrix.axes).toMatchObject({
      models: ['gpt-5.2', 'gpt-5.4'],
      runtimeProfiles: ['shared'],
      channels: ['web', 'slack'],
      memoryModes: ['off', 'semantic'],
      browserModes: ['generic_browser_operator', 'browser_procedure'],
    })
    expect(matrix.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        browserMode: 'browser_procedure',
        browserProcedureId: 'procedure-1',
      }),
    ]))
  })

  it('summarizes benchmark observations and converts candidates to eval results', () => {
    const matrix = buildAgentOpsBenchmarkMatrix({
      workflowId: 'check-page',
      scenario: 'homepage',
      models: ['gpt-5.2'],
      runtimeProfiles: ['shared'],
      channels: ['web'],
      memoryModes: ['project'],
      browserModes: ['generic_browser_operator', 'browser_procedure'],
      browserProcedureId: 'procedure-1',
    })
    const observations = matrix.candidates.map((candidate) => ({
      candidateId: candidate.id,
      judgeScore: candidate.browserMode === 'browser_procedure' ? 90 : 75,
      latencyMs: candidate.browserMode === 'browser_procedure' ? 1_000 : 2_000,
      costUsd: candidate.browserMode === 'browser_procedure' ? 0.01 : 0.02,
      tokenCount: candidate.browserMode === 'browser_procedure' ? 1_000 : 2_000,
      evidenceCompleteness: candidate.browserMode === 'browser_procedure' ? 95 : 70,
      failureType: null,
      passed: true,
      metadata: { browser_mode: candidate.browserMode },
    }))

    expect(summarizeBenchmarkObservations(observations)).toMatchObject({
      candidateCount: 2,
      bestCandidateId: matrix.candidates.find((candidate) => candidate.browserMode === 'browser_procedure')?.id,
      procedureLiftPct: 20,
      avgJudgeScore: 82.5,
      avgLatencyMs: 1_500,
      avgCostUsd: 0.02,
      avgTokenCount: 1_500,
      avgEvidenceCompleteness: 82.5,
      failureTypes: { none: 2 },
    })

    expect(buildBenchmarkEvalResults({ matrix, observations })[0]).toMatchObject({
      status: 'passed',
      evidence: expect.objectContaining({
        latency_ms: expect.any(Number),
        cost_usd: expect.any(Number),
        token_count: expect.any(Number),
        evidence_completeness: expect.any(Number),
      }),
      metadata: expect.objectContaining({
        benchmark: true,
        runtime_profile: 'shared',
        memory_mode: 'project',
      }),
    })
  })
})
