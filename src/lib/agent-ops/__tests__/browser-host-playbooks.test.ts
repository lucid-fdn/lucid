import { describe, expect, it } from 'vitest'

import {
  buildBrowserHostPlaybookRuntimeContext,
  rankBrowserHostPlaybookMatches,
  type AgentOpsBrowserHostPlaybook,
} from '../browser-host-playbooks'

function playbook(overrides: Partial<AgentOpsBrowserHostPlaybook> = {}): AgentOpsBrowserHostPlaybook {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    hostPattern: 'app.example.com',
    title: 'Dashboard checkout notes',
    bodyMd: 'Use the dashboard smoke path. Avoid destructive account actions.',
    scope: 'project',
    trustState: 'active',
    successfulUses: 3,
    securityFlagsCount: 0,
    lastUsedAt: null,
    sourceRunId: null,
    createdByUserId: null,
    createdByAgentId: null,
    metadata: {},
    createdAt: '2026-05-02T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('Browser Host Playbooks', () => {
  it('ranks active exact host project playbooks above wildcard org playbooks', () => {
    const matches = rankBrowserHostPlaybookMatches([
      playbook({
        id: '11111111-1111-4111-8111-111111111111',
        hostPattern: '*.example.com',
        scope: 'org',
        projectId: null,
        successfulUses: 10,
      }),
      playbook({
        id: '44444444-4444-4444-8444-444444444444',
        hostPattern: 'app.example.com',
        scope: 'project',
        successfulUses: 2,
      }),
    ], {
      host: 'https://app.example.com/dashboard',
      intent: 'dashboard',
    })

    expect(matches[0].playbook.id).toBe('44444444-4444-4444-8444-444444444444')
    expect(matches[0].reasons).toEqual(expect.arrayContaining([
      'active',
      'host_exact',
      'project_scope',
      'clean_security_history',
    ]))
  })

  it('does not return blocked or deprecated playbooks for runtime use', () => {
    const matches = rankBrowserHostPlaybookMatches([
      playbook({ trustState: 'blocked' }),
      playbook({ id: '55555555-5555-4555-8555-555555555555', trustState: 'deprecated' }),
    ], {
      host: 'app.example.com',
    })

    expect(matches).toEqual([])
  })

  it('serializes bounded runtime context without exposing unrelated fields', () => {
    const [context] = buildBrowserHostPlaybookRuntimeContext(
      rankBrowserHostPlaybookMatches([playbook({ bodyMd: 'a'.repeat(7000) })], {
        host: 'app.example.com',
      }),
    )

    expect(context).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Dashboard checkout notes',
      host_pattern: 'app.example.com',
      scope: 'project',
      trust_state: 'active',
    })
    expect(String(context.body_md)).toHaveLength(6000)
  })
})
