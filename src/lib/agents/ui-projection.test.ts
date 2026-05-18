import { describe, expect, it } from 'vitest'
import { buildAgentUiProjection } from './ui-projection'
import type { Agent } from '@/types/agent'
import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'

const baseAgent: Agent = {
  id: 'agent-1',
  org_id: 'org-1',
  name: 'Agent One',
  system_prompt: 'test',
  lucid_model: 'openai/gpt-5.4-mini',
  temperature: 0.7,
  max_tokens: 4096,
  memory_enabled: true,
  memory_window_size: 12,
  passport_id: null,
  is_active: true,
  created_at: '2026-04-16T10:00:00.000Z',
  updated_at: '2026-04-16T10:00:00.000Z',
  assistant_channels: [],
}

function makeEvent(partial: Partial<FeedEvent>): FeedEvent {
  return {
    id: partial.id ?? 'event-1',
    org_id: partial.org_id ?? 'org-1',
    agent_id: partial.agent_id ?? 'agent-1',
    agent_name: partial.agent_name ?? 'Agent One',
    event_type: partial.event_type ?? 'run_started',
    severity: partial.severity ?? 'info',
    payload: partial.payload ?? {},
    created_at: partial.created_at ?? '2026-04-16T10:05:00.000Z',
  }
}

function makeApproval(partial: Partial<PendingApproval>): PendingApproval {
  return {
    id: partial.id ?? 'approval-1',
    org_id: partial.org_id ?? 'org-1',
    agent_id: partial.agent_id ?? 'agent-1',
    agent_name: partial.agent_name ?? 'Agent One',
    run_id: partial.run_id ?? 'run-1',
    tool_name: partial.tool_name ?? 'browser',
    tool_args: partial.tool_args ?? {},
    estimated_cost_usd: partial.estimated_cost_usd ?? null,
    risk_level: partial.risk_level ?? 'medium',
    status: partial.status ?? 'pending',
    requested_at: partial.requested_at ?? '2026-04-16T10:06:00.000Z',
    expires_at: partial.expires_at ?? '2026-04-16T11:06:00.000Z',
  }
}

describe('buildAgentUiProjection', () => {
  it('returns shared runtime defaults for agents without a runtime', () => {
    const projection = buildAgentUiProjection({
      agent: baseAgent,
      feedEvents: [],
      approvals: [],
    })

    expect(projection.runtimeTitle).toBe('Shared runtime')
    expect(projection.runtimeDescription).toContain('Fastest setup')
    expect(projection.pendingApprovals).toBe(0)
    expect(projection.channelCount).toBe(0)
    expect(projection.teamLabel).toBe('Standalone')
    expect(projection.needsAttention).toBe(false)
    expect(projection.attentionLabel).toBeNull()
    expect(projection.lastEventLabel).toBeNull()
    expect(projection.lastFailureLabel).toBeNull()
  })

  it('marks agents with pending approvals as needing attention', () => {
    const projection = buildAgentUiProjection({
      agent: { ...baseAgent, runtime_flavor: 'c1_managed', runtime_id: 'runtime-1' },
      feedEvents: [makeEvent({ event_type: 'message_sent' })],
      approvals: [makeApproval({})],
    })

    expect(projection.runtimeTitle).toBe('Lucid-managed runtime')
    expect(projection.runtimeDescription).toContain('dedicated runtime operated by Lucid')
    expect(projection.pendingApprovals).toBe(1)
    expect(projection.needsAttention).toBe(true)
    expect(projection.attentionLabel).toBe('1 approval waiting')
    expect(projection.lastEventLabel).toBe('Message Sent')
  })

  it('preserves byo runtime packaging and failure attention', () => {
    const projection = buildAgentUiProjection({
      agent: {
        ...baseAgent,
        runtime_flavor: 'c2a_autonomous',
        runtime_id: 'runtime-2',
        crew_id: 'crew-1',
        assistant_channels: [
          {
            id: 'channel-1',
            channel_type: 'discord',
            is_active: true,
          },
        ],
      },
      feedEvents: [
        makeEvent({
          event_type: 'task_failed',
          severity: 'error',
          created_at: '2026-04-16T10:07:00.000Z',
        }),
      ],
      approvals: [],
    })

    expect(projection.runtimeTitle).toBe('Bring your own runtime')
    expect(projection.runtimeDescription).toContain('own infrastructure')
    expect(projection.teamLabel).toBe('Team-linked')
    expect(projection.channelCount).toBe(1)
    expect(projection.needsAttention).toBe(true)
    expect(projection.attentionLabel).toBe('Task Failed')
    expect(projection.lastEventLabel).toBe('Task Failed')
    expect(projection.lastFailureLabel).toBe('Task Failed')
  })
})
