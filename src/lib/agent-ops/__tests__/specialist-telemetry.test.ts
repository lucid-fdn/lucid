import { describe, expect, it } from 'vitest'

import { summarizeAgentOpsSpecialistTelemetry } from '../specialist-telemetry'

describe('specialist telemetry', () => {
  it('summarizes selected specialists from runtime-agnostic run metadata and finding outcomes', () => {
    const telemetry = summarizeAgentOpsSpecialistTelemetry({
      runs: [
        {
          id: 'run-1',
          workflowId: 'review',
          status: 'completed',
          latencyMs: 1_500,
          costUsd: 0.01,
          totalTokens: 1_200,
          createdAt: '2026-04-30T10:00:00.000Z',
          metadata: {
            team_ops: {
              specialists: [
                { slug: 'security', name: 'Security Reviewer', category: 'security', critical: true },
                { slug: 'correctness', name: 'Correctness Reviewer', category: 'correctness', critical: false },
              ],
            },
          },
        },
      ],
      findings: [
        {
          id: 'finding-1',
          runId: 'run-1',
          severity: 'critical',
          status: 'accepted',
          confidence: 0.92,
          metadata: { specialist: 'security' },
          createdAt: '2026-04-30T10:01:00.000Z',
          updatedAt: '2026-04-30T10:01:00.000Z',
        },
        {
          id: 'finding-2',
          runId: 'run-1',
          severity: 'medium',
          status: 'dismissed',
          confidence: 0.5,
          metadata: { specialist: 'correctness' },
          createdAt: '2026-04-30T10:02:00.000Z',
          updatedAt: '2026-04-30T10:02:00.000Z',
        },
      ],
    })

    expect(telemetry[0]).toMatchObject({
      slug: 'security',
      critical: true,
      selectedCount: 1,
      findingCount: 1,
      acceptedCount: 1,
      usefulFindingCount: 1,
      criticalFindingCount: 1,
      signal: 'high_value',
      avgLatencyMs: 1_500,
      totalCostUsd: 0.01,
      totalTokens: 1_200,
    })
    expect(telemetry.find((specialist) => specialist.slug === 'correctness')).toMatchObject({
      dismissedCount: 1,
      falsePositiveCount: 1,
      usefulnessRate: 0,
      signal: 'insufficient_data',
    })
  })

  it('attributes findings without explicit specialist metadata when a run has exactly one selected specialist', () => {
    const telemetry = summarizeAgentOpsSpecialistTelemetry({
      runs: [
        {
          id: 'run-1',
          workflowId: 'qa',
          status: 'completed',
          createdAt: '2026-04-30T10:00:00.000Z',
          metadata: {
            team_ops: {
              specialists: [{ slug: 'browser-qa', name: 'Browser QA Specialist', category: 'browser_qa' }],
            },
          },
        },
      ],
      findings: [
        {
          id: 'finding-1',
          runId: 'run-1',
          severity: 'high',
          status: 'fixed',
          metadata: {},
          createdAt: '2026-04-30T10:01:00.000Z',
          updatedAt: '2026-04-30T10:01:00.000Z',
        },
      ],
    })

    expect(telemetry).toHaveLength(1)
    expect(telemetry[0]).toMatchObject({
      slug: 'browser-qa',
      fixedCount: 1,
      usefulFindingCount: 1,
      highSeverityFindingCount: 1,
      signal: 'insufficient_data',
    })
  })

  it('marks repeatedly selected specialists with no findings as tuning candidates', () => {
    const telemetry = summarizeAgentOpsSpecialistTelemetry({
      runs: Array.from({ length: 5 }).map((_, index) => ({
        id: `run-${index}`,
        workflowId: 'review',
        status: 'completed',
        createdAt: `2026-04-30T10:0${index}:00.000Z`,
        metadata: {
          team_ops: {
            specialists: [{ slug: 'docs-release', name: 'Docs Release Specialist', category: 'docs' }],
          },
        },
      })),
      findings: [],
    })

    expect(telemetry[0]).toMatchObject({
      slug: 'docs-release',
      selectedCount: 5,
      findingCount: 0,
      signal: 'needs_tuning',
    })
  })
})
