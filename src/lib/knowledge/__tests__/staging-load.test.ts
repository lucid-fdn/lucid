import { describe, expect, it } from 'vitest'

import { buildKnowledgeStagingLoadReport, type KnowledgeStagingLoadSample } from '../staging-load'

describe('Knowledge staging load report', () => {
  it('passes when latency, failures, packet shape, and layer coverage stay inside budget', () => {
    const report = buildKnowledgeStagingLoadReport(samples(), {
      maxP95Ms: 150,
      maxFailureRate: 0,
      requiredLayers: ['project_brain', 'org_brain'],
    })

    expect(report.status).toBe('pass')
    expect(report.p95Ms).toBe(140)
    expect(report.emptyPackets).toBe(0)
    expect(report.layerCounts.project_brain).toBe(2)
    expect(report.blockingReasons).toEqual([])
  })

  it('fails on slow p95, empty packets, timeouts, errors, and missing layers', () => {
    const report = buildKnowledgeStagingLoadReport([
      ...samples(),
      {
        query: 'empty',
        durationMs: 600,
        itemCount: 0,
        timedOut: true,
        fallbackUsed: true,
        retrievalCounts: {},
      },
      {
        query: 'error',
        durationMs: 20,
        itemCount: 0,
        timedOut: false,
        fallbackUsed: false,
        retrievalCounts: {},
        error: 'boom',
      },
    ], {
      maxP95Ms: 150,
      maxFailureRate: 0.1,
      requiredLayers: ['assistant_memory'],
    })

    expect(report.status).toBe('fail')
    expect(report.blockingReasons).toEqual(expect.arrayContaining([
      'p95_latency_over_budget',
      'failure_rate_over_budget',
      'empty_packets_present',
      'timeouts_present',
      'missing_layers:assistant_memory',
    ]))
  })
})

function samples(): KnowledgeStagingLoadSample[] {
  return [
    {
      query: 'checkout policy',
      durationMs: 90,
      itemCount: 3,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: { project_brain: 1, org_brain: 1 },
    },
    {
      query: 'browser qa',
      durationMs: 140,
      itemCount: 2,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: { project_brain: 1 },
    },
  ]
}
