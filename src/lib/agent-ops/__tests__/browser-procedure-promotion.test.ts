import { describe, expect, it } from 'vitest'

import { buildBrowserProcedurePromotionPlan } from '../browser-procedure-promotion'
import type { AgentOpsArtifact, AgentOpsBrowserQaSession, AgentOpsRun } from '../workflow-types'

const run: AgentOpsRun = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  assistantId: '44444444-4444-4444-8444-444444444444',
  requestedByUserId: null,
  workflowId: 'check-page',
  workflowVersion: '1.0.0',
  status: 'completed',
  runMode: 'execute',
  scope: { type: 'url', ref: 'https://www.example.com/', label: 'Example homepage', metadata: {} },
  input: { target: 'https://www.example.com/' },
  output: { summary: 'Looks healthy', risks: [] },
  agentRunIds: [],
  orchestrationDagId: null,
  humanWorkItemIds: [],
  approvalIds: [],
  artifactCount: 1,
  findingCount: 0,
  latencyMs: 1200,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  startedAt: '2026-05-02T00:00:00.000Z',
  completedAt: '2026-05-02T00:01:00.000Z',
  errorMessage: null,
  metadata: {},
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:01:00.000Z',
}

const screenshot: AgentOpsArtifact = {
  id: '55555555-5555-4555-8555-555555555555',
  orgId: run.orgId,
  runId: run.id,
  type: 'screenshot',
  title: 'Homepage screenshot',
  summary: 'Above-the-fold screenshot.',
  uri: 'https://storage.example/screenshot.png',
  content: {
    browser_qa: {
      target_url: 'https://www.example.com/',
      steps: [{ action: 'open', target_url: 'https://www.example.com/' }],
    },
  },
  checksum: 'checksum',
  createdAt: '2026-05-02T00:00:30.000Z',
}

const session: AgentOpsBrowserQaSession = {
  id: '66666666-6666-4666-8666-666666666666',
  orgId: run.orgId,
  runId: run.id,
  assistantId: run.assistantId,
  sessionKey: 'session-key',
  targetUrl: 'https://www.example.com/',
  status: 'completed',
  ownerRuntimeId: null,
  viewport: {},
  artifactCount: 1,
  lastArtifactId: screenshot.id,
  lastError: null,
  startedAt: '2026-05-02T00:00:00.000Z',
  completedAt: '2026-05-02T00:01:00.000Z',
  expiresAt: '2026-05-03T00:00:00.000Z',
  metadata: {},
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:01:00.000Z',
}

describe('Browser Procedure promotion', () => {
  it('builds a quarantined declarative plan from Browser Operator evidence', () => {
    const plan = buildBrowserProcedurePromotionPlan({
      run,
      artifacts: [screenshot],
      browserQaSessions: [session],
    })

    expect(plan).toMatchObject({
      hostPattern: 'www.example.com',
      procedureType: 'qa',
      riskLevel: 'medium',
      fixtureArtifactId: screenshot.id,
    })
    expect(plan?.definition).toMatchObject({
      kind: 'browser_operator_plan',
      source: 'agent_ops_run_promotion',
      source_run_id: run.id,
      mode: 'replay_guided',
    })
    expect(plan?.testDefinition).toMatchObject({
      fixture: expect.objectContaining({ artifact_id: screenshot.id }),
    })
    expect(plan?.approvalPolicy).toMatchObject({
      requires_operator_review: true,
      default_trust_state: 'quarantined',
    })
  })

  it('returns null when a run has no browser evidence', () => {
    expect(buildBrowserProcedurePromotionPlan({
      run,
      artifacts: [],
      browserQaSessions: [],
    })).toBeNull()
  })
})
