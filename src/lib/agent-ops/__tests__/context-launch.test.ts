import { describe, expect, it } from 'vitest'

import { buildAgentOpsLaunchHref, parseAgentOpsLaunchParams } from '../context-launch'

describe('Agent Ops contextual launch', () => {
  it('builds a stable Mission Control launch URL with scope and input defaults', () => {
    const href = buildAgentOpsLaunchHref({
      workspaceSlug: 'acme',
      workflowId: 'qa',
      source: 'project',
      projectId: '33333333-3333-4333-8333-333333333333',
      assistantId: '44444444-4444-4444-8444-444444444444',
      scopeType: 'project',
      scopeRef: 'project-slug',
      scopeLabel: 'Acme Project',
      inputDefaults: {
        target: 'https://preview.example.com',
        scenario: 'Checkout smoke',
      },
    })

    expect(href).toContain('/acme/mission-control/agent-ops?')
    const parsed = parseAgentOpsLaunchParams(new URL(`https://app.local${href}`).searchParams)
    expect(parsed).toMatchObject({
      workflowId: 'qa',
      projectId: '33333333-3333-4333-8333-333333333333',
      assistantId: '44444444-4444-4444-8444-444444444444',
      scopeType: 'project',
      scopeRef: 'project-slug',
      scopeLabel: 'Acme Project',
      source: 'project',
      inputDefaults: {
        target: 'https://preview.example.com',
        scenario: 'Checkout smoke',
      },
    })
  })

  it('supports run-scoped launches as a first-class context', () => {
    const href = buildAgentOpsLaunchHref({
      workspaceSlug: 'acme',
      workflowId: 'retro',
      source: 'run',
      scopeType: 'run',
      scopeRef: 'run-123',
      scopeLabel: 'Latest release run',
    })

    const parsed = parseAgentOpsLaunchParams(new URL(`https://app.local${href}`).searchParams)
    expect(parsed).toMatchObject({
      workflowId: 'retro',
      source: 'run',
      scopeType: 'run',
      scopeRef: 'run-123',
      scopeLabel: 'Latest release run',
    })
  })
})
