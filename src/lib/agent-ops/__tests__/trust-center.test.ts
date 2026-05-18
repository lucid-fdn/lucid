import { describe, expect, it } from 'vitest'

import { buildAgentOpsTrustCenterModel } from '../trust-center'
import type { AgentOpsRun, AgentOpsWorkflowId } from '../workflow-types'

const ORG_ID = '11111111-1111-4111-8111-111111111111'

function run(overrides: Partial<AgentOpsRun> = {}): AgentOpsRun {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    orgId: ORG_ID,
    projectId: null,
    assistantId: null,
    requestedByUserId: null,
    workflowId: 'qa',
    workflowVersion: '1.0.0',
    status: 'completed',
    runMode: 'execute',
    scope: { type: 'org', ref: ORG_ID, label: 'Workspace', metadata: {} },
    input: {},
    output: null,
    agentRunIds: [],
    humanWorkItemIds: [],
    approvalIds: [],
    artifactCount: 1,
    findingCount: 0,
    latencyMs: 1200,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    metadata: {},
    createdAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-18T10:00:00.000Z',
    ...overrides,
  }
}

function workflow(id: AgentOpsWorkflowId) {
  return { id, name: id }
}

describe('buildAgentOpsTrustCenterModel', () => {
  it('returns ready with clean overview and quality evidence', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: {
        summary: {
          latestEvalReceiptVerdict: 'pass',
          performanceHealth: 'healthy',
          safetyMode: 'normal',
        },
      },
      runs: [run()],
      workflows: [workflow('qa')],
    })

    expect(model.state).toBe('ready')
    expect(model.confidence).toBe('high')
    expect(model.recommendedAction.id).toBe('maintenance:fresh-check')
  })

  it('blocks autonomy when required setup is missing', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { teamSetupRequiredMissingCount: 2, latestEvalReceiptVerdict: 'pass' } },
      runs: [run()],
      workflows: [workflow('release-check')],
    })

    expect(model.state).toBe('blocked')
    expect(model.recommendedAction.id).toBe('readiness:missing-setup')
    expect(model.recommendedAction.workflowId).toBe('release-check')
  })

  it('blocks autonomy when safety mode is frozen', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { safetyMode: 'freeze', latestEvalReceiptVerdict: 'pass' } },
      runs: [run()],
      workflows: [],
    })

    expect(model.state).toBe('blocked')
    expect(model.signals.find((signal) => signal.id === 'policy')?.state).toBe('blocked')
  })

  it('blocks autonomy for blocking browser security events', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { blockingBrowserSecurityEventCount: 1, latestEvalReceiptVerdict: 'pass' } },
      runs: [run()],
      workflows: [workflow('security-audit')],
    })

    expect(model.state).toBe('blocked')
    expect(model.recommendedAction.id).toBe('policy:security-events')
  })

  it('blocks autonomy for performance breaches', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { performanceHealth: 'breach', latestEvalReceiptVerdict: 'pass' } },
      runs: [run()],
      workflows: [workflow('canary')],
    })

    expect(model.state).toBe('blocked')
    expect(model.recommendedAction.id).toBe('policy:performance-breach')
  })

  it('needs review for failed runs', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { latestEvalReceiptVerdict: 'pass' } },
      runs: [run({ status: 'failed' })],
      workflows: [workflow('investigate')],
    })

    expect(model.state).toBe('needs_review')
    expect(model.recommendedAction.id).toBe('reliability:failed-runs')
  })

  it('needs review when eval evidence is missing', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { performanceHealth: 'healthy' } },
      runs: [run()],
      workflows: [workflow('qa')],
    })

    expect(model.state).toBe('needs_review')
    expect(model.recommendedAction.id).toBe('quality:no-eval')
  })

  it('needs review for pending decisions', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { askedDecisionCount: 1, latestEvalReceiptVerdict: 'pass' } },
      runs: [run()],
      workflows: [workflow('review')],
    })

    expect(model.state).toBe('needs_review')
    expect(model.signals.find((signal) => signal.id === 'change_safety')?.state).toBe('watch')
  })

  it('orders critical actions before warnings', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: {
        summary: {
          teamSetupRequiredMissingCount: 1,
          askedDecisionCount: 1,
        },
      },
      runs: [run({ status: 'failed' })],
      workflows: [workflow('review')],
    })

    expect(model.recommendedAction.severity).toBe('critical')
  })

  it('keeps proof receipts out of the trust-center summary model', () => {
    const model = buildAgentOpsTrustCenterModel({
      overview: { summary: { latestEvalReceiptVerdict: 'pass' } },
      runs: [run({ workflowId: 'security-audit', status: 'blocked' })],
      workflows: [],
    })

    expect(model.signals.find((signal) => signal.id === 'reliability')?.state).toBe('blocked')
    expect(model).not.toHaveProperty('evidence')
  })
})
