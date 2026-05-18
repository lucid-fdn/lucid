import { describe, expect, it } from 'vitest'

import { buildBrowserOperatorConsole } from '../browser-operator-console'
import type { AgentOpsBrowserProcedure } from '../browser-procedures'
import type { AgentOpsBrowserHostPlaybook } from '../browser-host-playbooks'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'

const procedure: AgentOpsBrowserProcedure = {
  id: '55555555-5555-4555-8555-555555555555',
  orgId,
  projectId,
  hostPattern: 'www.example.com',
  name: 'Check homepage',
  slug: 'check-homepage',
  description: 'Check the public homepage.',
  intentTriggers: ['check homepage'],
  procedureType: 'qa',
  scope: 'project',
  trustState: 'active',
  sourceRunId: runId,
  createdByUserId: null,
  createdByAgentId: null,
  metadata: {},
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
}

const playbook: AgentOpsBrowserHostPlaybook = {
  id: '66666666-6666-4666-8666-666666666666',
  orgId,
  projectId,
  hostPattern: 'www.example.com',
  title: 'Homepage notes',
  bodyMd: 'Use public smoke checks.',
  scope: 'project',
  trustState: 'active',
  successfulUses: 4,
  securityFlagsCount: 0,
  lastUsedAt: '2026-05-07T00:05:00.000Z',
  sourceRunId: runId,
  createdByUserId: null,
  createdByAgentId: null,
  metadata: {},
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:05:00.000Z',
}

describe('Browser Operator console', () => {
  it('builds a centralized operator projection across procedures, playbooks, sessions, and trust', () => {
    const console = buildBrowserOperatorConsole({
      procedures: [procedure],
      hostPlaybooks: [playbook],
      securityEvents: [{
        orgId,
        projectId,
        opsRunId: runId,
        browserSessionId: 'browser-session-1',
        eventType: 'prompt_injection_pattern',
        severity: 'warn',
        layer: 'browser_content',
        host: 'www.example.com',
        details: { pattern: 'ignore previous instructions' },
        createdAt: '2026-05-07T00:02:00.000Z',
      }],
      sessionEvents: [
        {
          orgId,
          runId,
          browserSessionId: 'browser-session-1',
          sessionKey: 'session-key-1',
          eventType: 'session_started',
          severity: 'info',
          currentUrl: 'https://www.example.com',
          metadata: {},
          createdAt: '2026-05-07T00:00:00.000Z',
        },
        {
          orgId,
          runId,
          browserSessionId: 'browser-session-1',
          sessionKey: 'session-key-1',
          eventType: 'handoff_required',
          severity: 'warn',
          handoffState: 'auth_required',
          currentUrl: 'https://www.example.com/login',
          message: 'Login required.',
          metadata: {},
          createdAt: '2026-05-07T00:03:00.000Z',
        },
      ],
      sessionShares: [{
        orgId,
        projectId,
        runId,
        sessionKey: 'session-key-1',
        scope: 'handoff-only',
        status: 'active',
        tokenPrefix: 'lucid_browser_share_ab',
        tabIdentity: 'tab_123',
        rateLimitPerMinute: 30,
        expiresAt: '2026-05-07T00:30:00.000Z',
        metadata: {},
      }],
      sessionSharedActions: [{
        orgId,
        projectId,
        runId,
        sessionKey: 'session-key-1',
        scope: 'handoff-only',
        actionType: 'handoff_requested',
        status: 'allowed',
        actorAgentLabel: 'Browser QA Specialist',
        metadata: {},
      }],
    })

    expect(console.health).toBe('needs_review')
    expect(console.summary).toMatchObject({
      procedureCount: 1,
      activeProcedureCount: 1,
      playbookCount: 1,
      activePlaybookCount: 1,
      sessionCount: 1,
      handoffSessionCount: 1,
      warningTrustEventCount: 1,
      activeShareCount: 1,
    })
    expect(console.sessions[0]).toMatchObject({
      sessionKey: 'session-key-1',
      status: 'handoff_required',
      trustState: 'degraded',
      handoffState: 'auth_required',
      activeShareCount: 1,
      sharedActionCount: 1,
    })
    expect(console.warnings).toContain('At least one live browser session is waiting for a human handoff.')
  })

  it('marks sessions resumable after a fake-provider handoff resolution', () => {
    const console = buildBrowserOperatorConsole({
      procedures: [procedure],
      sessionEvents: [
        {
          orgId,
          runId,
          sessionKey: 'session-key-1',
          eventType: 'handoff_required',
          severity: 'warn',
          handoffState: 'auth_required',
          message: 'Login required.',
          metadata: {},
          createdAt: '2026-05-07T00:00:00.000Z',
        },
        {
          orgId,
          runId,
          sessionKey: 'session-key-1',
          eventType: 'handoff_resolved',
          severity: 'info',
          message: 'Operator completed login.',
          metadata: { provider: 'fake-browser-provider' },
          createdAt: '2026-05-07T00:01:00.000Z',
        },
      ],
      sessionSharedActions: [{
        orgId,
        projectId,
        runId,
        sessionKey: 'session-key-1',
        actionType: 'resume_requested',
        status: 'allowed',
        actorAgentLabel: 'Operator',
        metadata: { provider: 'fake-browser-provider' },
      }],
    })

    expect(console.health).toBe('ready')
    expect(console.sessions[0]).toMatchObject({
      status: 'resumable',
      latestEventType: 'handoff_resolved',
    })
  })
})
