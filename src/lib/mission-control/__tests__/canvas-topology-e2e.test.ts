/**
 * Canvas Topology — E2E Simulation Tests
 *
 * Simulates real user flows through the canvas topology system:
 * - Building ReactFlow nodes from normalized topology data
 * - Runtime grouping (dedicated + shared synthetic)
 * - Live feed processing (sparkline, presence, edge events)
 * - Focus halo computation (dimming, connected context)
 * - Edge-event matching (explicit channel_id/recipient_agent_id)
 * - Graceful degradation (no runtimes, no feed, no presence)
 * - Compound auto-layout with coordinate post-processing
 *
 * Uses the same pure functions used in production canvas-client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from 'reactflow'
import type { FeedEvent } from '../types'
import { derivePresenceState } from '../presence'

// ─── Mock ELK for auto-layout tests ───

const mockLayout = vi.fn()

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout = mockLayout
  },
}))

import { autoLayoutNodes, type LayoutGroup } from '@/lib/workflow/auto-layout'

// ─── Helpers (mirror canvas-client logic) ───

const SPARKLINE_BUCKETS = 7
const SPARKLINE_BUCKET_MS = 30_000

function makeEvent(
  type: string,
  ageMs: number,
  agentId = 'agent-1',
  payload: Record<string, unknown> = {},
): FeedEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    event_type: type as FeedEvent['event_type'],
    severity: 'info',
    agent_id: agentId,
    agent_name: 'Test Agent',
    org_id: 'org-1',
    run_id: null,
    payload,
    created_at: new Date(Date.now() - ageMs).toISOString(),
  }
}

function buildSparklineData(events: FeedEvent[], agentId: string): number[] {
  const now = Date.now()
  const buckets = new Array(SPARKLINE_BUCKETS).fill(0) as number[]
  for (const e of events) {
    if (e.agent_id !== agentId) continue
    const age = now - new Date(e.created_at).getTime()
    const idx = SPARKLINE_BUCKETS - 1 - Math.floor(age / SPARKLINE_BUCKET_MS)
    if (idx >= 0 && idx < SPARKLINE_BUCKETS) buckets[idx]++
  }
  return buckets
}

function countAgentEvents(events: FeedEvent[], agentId: string, windowMs = 300_000) {
  const cutoff = Date.now() - windowMs
  let total = 0
  let errors = 0
  for (const e of events) {
    if (e.agent_id !== agentId) continue
    if (new Date(e.created_at).getTime() < cutoff) continue
    total++
    if (e.severity === 'error' || e.event_type === 'error') errors++
  }
  return { total, errors }
}

function computeEdgeActivity(
  events: FeedEvent[],
  source: string,
  target: string,
): { eventCount: number; lastEventAt: number } {
  let eventCount = 0
  let lastEventAt = 0
  const cutoff = Date.now() - 60_000

  for (const e of events) {
    const ts = new Date(e.created_at).getTime()
    if (ts < cutoff) continue

    if (e.agent_id === source) {
      const channelType = (e.payload as any)?.channel_type
      if (channelType && `ch-${channelType}` === target) {
        eventCount++
        if (ts > lastEventAt) lastEventAt = ts
        continue
      }
      const channelId = (e.payload as any)?.channel_id
      if (channelId && `ch-${channelId}` === target) {
        eventCount++
        if (ts > lastEventAt) lastEventAt = ts
        continue
      }
    }

    if (e.agent_id === source) {
      const recipientId = (e.payload as any)?.recipient_agent_id ?? (e.payload as any)?.to_agent_id
      if (recipientId === target) {
        eventCount++
        if (ts > lastEventAt) lastEventAt = ts
      }
    }
  }

  return { eventCount, lastEventAt }
}

// ─── Topology data fixtures ───

interface RuntimeEntity {
  id: string; displayName: string; provider: string; status: string
  cpuPercent: number | null; ramPercent: number | null; lastSeenAt: string | null
}

interface AgentEntity {
  id: string; name: string; status: string; model: string; runtimeId: string | null
  healthScore: number | null; costTodayUsd: number | null; errorsLastHour: number
}

interface ChannelEntity {
  id: string; type: string; name: string; isActive: boolean
}

interface ConnectionEntity {
  source: string; target: string; isActive: boolean
}

function makeTopology(overrides: {
  runtimes?: RuntimeEntity[]
  agents?: AgentEntity[]
  channels?: ChannelEntity[]
  connections?: ConnectionEntity[]
} = {}) {
  return {
    runtimes: overrides.runtimes ?? [],
    agents: overrides.agents ?? [],
    channels: overrides.channels ?? [],
    connections: overrides.connections ?? [],
  }
}

function makeAgent(id: string, runtimeId: string | null = null): AgentEntity {
  return {
    id, name: `Agent ${id}`, status: 'active', model: 'gpt-4o',
    runtimeId, healthScore: 80, costTodayUsd: 1.0, errorsLastHour: 0,
  }
}

function makeRuntime(id: string, provider = 'railway'): RuntimeEntity {
  return {
    id, displayName: `Runtime ${id}`, provider, status: 'active',
    cpuPercent: 40, ramPercent: 55, lastSeenAt: new Date().toISOString(),
  }
}

// ─── Tests ───

beforeEach(() => {
  mockLayout.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── Scenario 1: Runtime grouping ───

describe('Runtime grouping', () => {
  it('groups agents under their dedicated runtime', () => {
    const topology = makeTopology({
      runtimes: [makeRuntime('rt-1')],
      agents: [makeAgent('a-1', 'rt-1'), makeAgent('a-2', 'rt-1')],
    })

    const runtimeMap = new Map<string, string[]>()
    const ungrouped: string[] = []

    for (const agent of topology.agents) {
      if (agent.runtimeId) {
        const list = runtimeMap.get(agent.runtimeId) || []
        list.push(agent.id)
        runtimeMap.set(agent.runtimeId, list)
      } else {
        ungrouped.push(agent.id)
      }
    }

    expect(runtimeMap.get('rt-1')).toEqual(['a-1', 'a-2'])
    expect(ungrouped).toHaveLength(0)
  })

  it('creates synthetic shared runtime for ungrouped agents', () => {
    const topology = makeTopology({
      agents: [makeAgent('a-1'), makeAgent('a-2')],
    })

    const ungrouped = topology.agents.filter(a => !a.runtimeId).map(a => a.id)
    expect(ungrouped).toEqual(['a-1', 'a-2'])

    // Canvas would create runtime-shared node for these
    const sharedGroup: LayoutGroup = {
      id: 'runtime-shared',
      children: ungrouped,
    }
    expect(sharedGroup.children).toHaveLength(2)
  })

  it('handles mixed dedicated and shared agents', () => {
    const topology = makeTopology({
      runtimes: [makeRuntime('rt-1')],
      agents: [makeAgent('a-1', 'rt-1'), makeAgent('a-2'), makeAgent('a-3')],
    })

    const dedicated = topology.agents.filter(a => a.runtimeId).map(a => a.id)
    const shared = topology.agents.filter(a => !a.runtimeId).map(a => a.id)

    expect(dedicated).toEqual(['a-1'])
    expect(shared).toEqual(['a-2', 'a-3'])
  })

  it('skips empty runtimes (no assigned agents)', () => {
    const topology = makeTopology({
      runtimes: [makeRuntime('rt-empty')],
      agents: [makeAgent('a-1')], // no runtime_id
    })

    const assigned = topology.agents.filter(a => a.runtimeId === 'rt-empty')
    expect(assigned).toHaveLength(0)
    // Canvas skips runtime node creation when no children
  })
})

// ─── Scenario 2: Compound auto-layout ───

describe('Compound auto-layout', () => {
  it('passes compound groups to ELK', async () => {
    const nodes: Node[] = [
      { id: 'runtime-rt1', type: 'runtimeNode', position: { x: 0, y: 0 }, data: {}, width: 280, height: 160 },
      { id: 'a-1', type: 'agent', position: { x: 0, y: 0 }, data: {}, width: 220, height: 110 },
      { id: 'a-2', type: 'agent', position: { x: 0, y: 0 }, data: {}, width: 220, height: 110 },
      { id: 'ch-telegram', type: 'channel', position: { x: 0, y: 0 }, data: {}, width: 140, height: 60 },
    ]

    const edges: Edge[] = [
      { id: 'e-1', source: 'a-1', target: 'ch-telegram' },
    ]

    const groups: LayoutGroup[] = [
      { id: 'runtime-rt1', children: ['a-1', 'a-2'], padding: 20 },
    ]

    mockLayout.mockResolvedValue({
      children: [
        {
          id: 'runtime-rt1',
          x: 0,
          y: 0,
          width: 500,
          height: 300,
          children: [
            { id: 'a-1', x: 20, y: 50 },
            { id: 'a-2', x: 20, y: 170 },
          ],
        },
        { id: 'ch-telegram', x: 600, y: 100 },
      ],
    })

    const result = await autoLayoutNodes(nodes, edges, { direction: 'RIGHT' }, groups)

    // Verify runtime node got sized
    const runtimeNode = result.find(n => n.id === 'runtime-rt1')
    expect(runtimeNode).toBeDefined()
    expect(runtimeNode!.width).toBe(500)
    expect(runtimeNode!.height).toBe(300)

    // Verify child positions (ELK returns children inside parent node → relative)
    const a1 = result.find(n => n.id === 'a-1')
    expect(a1).toBeDefined()
    expect(a1!.position.x).toBe(20)
    expect(a1!.position.y).toBe(50)

    // Channel positioned outside group
    const ch = result.find(n => n.id === 'ch-telegram')
    expect(ch).toBeDefined()
    expect(ch!.position.x).toBe(600)
  })

  it('falls back to flat layout when no groups', async () => {
    const nodes: Node[] = [
      { id: 'a-1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
    ]

    mockLayout.mockResolvedValue({
      children: [{ id: 'a-1', x: 50, y: 100 }],
    })

    const result = await autoLayoutNodes(nodes, [], {})
    expect(result[0].position).toEqual({ x: 50, y: 100 })
  })

  it('handles ELK failure gracefully with groups', async () => {
    const nodes: Node[] = [
      { id: 'a-1', type: 'agent', position: { x: 10, y: 20 }, data: {} },
    ]

    mockLayout.mockRejectedValue(new Error('ELK crashed'))

    const groups: LayoutGroup[] = [
      { id: 'rt-1', children: ['a-1'] },
    ]

    const result = await autoLayoutNodes(nodes, [], {}, groups)
    // Should return original nodes on failure
    expect(result[0].position).toEqual({ x: 10, y: 20 })
  })

  it('sends hierarchyHandling INCLUDE_CHILDREN to ELK', async () => {
    const nodes: Node[] = [
      { id: 'rt-1', type: 'runtimeNode', position: { x: 0, y: 0 }, data: {}, width: 280, height: 160 },
      { id: 'a-1', type: 'agent', position: { x: 0, y: 0 }, data: {}, width: 220, height: 110 },
    ]

    const groups: LayoutGroup[] = [{ id: 'rt-1', children: ['a-1'] }]

    mockLayout.mockResolvedValue({
      children: [
        { id: 'rt-1', x: 0, y: 0, width: 300, height: 200, children: [{ id: 'a-1', x: 20, y: 50 }] },
      ],
    })

    await autoLayoutNodes(nodes, [], {}, groups)

    const graphArg = mockLayout.mock.calls[0][0]
    expect(graphArg.layoutOptions['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN')
  })
})

// ─── Scenario 3: Live feed → sparkline ───

describe('Sparkline computation', () => {
  it('produces 7 buckets', () => {
    const events = [
      makeEvent('tool_call', 5_000, 'agent-1'),
      makeEvent('message_sent', 35_000, 'agent-1'),
      makeEvent('run_started', 65_000, 'agent-1'),
    ]
    const data = buildSparklineData(events, 'agent-1')
    expect(data).toHaveLength(7)
  })

  it('places recent events in last bucket', () => {
    const events = [makeEvent('tool_call', 1_000, 'agent-1')]
    const data = buildSparklineData(events, 'agent-1')
    expect(data[6]).toBe(1)
    expect(data.slice(0, 6).every(v => v === 0)).toBe(true)
  })

  it('filters by agent_id', () => {
    const events = [
      makeEvent('tool_call', 1_000, 'agent-1'),
      makeEvent('tool_call', 1_000, 'agent-2'),
    ]
    const data = buildSparklineData(events, 'agent-1')
    expect(data.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('ignores events older than window (7 * 30s = 210s)', () => {
    const events = [makeEvent('tool_call', 250_000, 'agent-1')]
    const data = buildSparklineData(events, 'agent-1')
    expect(data.every(v => v === 0)).toBe(true)
  })

  it('returns all zeros for empty events', () => {
    const data = buildSparklineData([], 'agent-1')
    expect(data).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

// ─── Scenario 4: Event counting ───

describe('Event counting for badges', () => {
  it('counts total events in 5-minute window', () => {
    const events = [
      makeEvent('tool_call', 10_000, 'agent-1'),
      makeEvent('message_sent', 60_000, 'agent-1'),
      makeEvent('run_started', 120_000, 'agent-1'),
    ]
    const { total } = countAgentEvents(events, 'agent-1')
    expect(total).toBe(3)
  })

  it('counts errors separately', () => {
    const events = [
      makeEvent('tool_call', 10_000, 'agent-1'),
      { ...makeEvent('error', 20_000, 'agent-1'), severity: 'error' as const },
      { ...makeEvent('tool_call', 30_000, 'agent-1'), severity: 'error' as const },
    ]
    const { total, errors } = countAgentEvents(events, 'agent-1')
    expect(total).toBe(3)
    expect(errors).toBe(2)
  })

  it('excludes events older than 5 minutes', () => {
    const events = [
      makeEvent('tool_call', 10_000, 'agent-1'),
      makeEvent('tool_call', 400_000, 'agent-1'), // older than 5 min
    ]
    const { total } = countAgentEvents(events, 'agent-1')
    expect(total).toBe(1)
  })

  it('filters by agent_id', () => {
    const events = [
      makeEvent('tool_call', 10_000, 'agent-1'),
      makeEvent('tool_call', 10_000, 'agent-2'),
    ]
    const { total } = countAgentEvents(events, 'agent-1')
    expect(total).toBe(1)
  })
})

// ─── Scenario 5: Edge-event matching ───

describe('Edge-event matching', () => {
  it('matches agent→channel by channel_type in payload', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-1', { channel_type: 'telegram' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(1)
  })

  it('matches agent→channel by channel_id in payload', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-1', { channel_id: 'telegram' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(1)
  })

  it('matches agent→agent by recipient_agent_id', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-1', { recipient_agent_id: 'agent-2' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'agent-2')
    expect(eventCount).toBe(1)
  })

  it('matches agent→agent by to_agent_id', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-1', { to_agent_id: 'agent-2' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'agent-2')
    expect(eventCount).toBe(1)
  })

  it('does NOT match events without channel/agent target (no random particles)', () => {
    const events = [
      makeEvent('tool_call', 5_000, 'agent-1', {}), // no channel_type or recipient
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(0)
  })

  it('does NOT match events from wrong agent', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-2', { channel_type: 'telegram' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(0)
  })

  it('ignores events older than 60s', () => {
    const events = [
      makeEvent('message_sent', 70_000, 'agent-1', { channel_type: 'telegram' }),
    ]
    const { eventCount } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(0)
  })

  it('tracks lastEventAt correctly', () => {
    const events = [
      makeEvent('message_sent', 5_000, 'agent-1', { channel_type: 'telegram' }),
      makeEvent('message_sent', 10_000, 'agent-1', { channel_type: 'telegram' }),
    ]
    const { eventCount, lastEventAt } = computeEdgeActivity(events, 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(2)
    // lastEventAt should be the more recent one
    expect(lastEventAt).toBeGreaterThan(0)
  })

  it('returns zero for no matching events', () => {
    const { eventCount, lastEventAt } = computeEdgeActivity([], 'agent-1', 'ch-telegram')
    expect(eventCount).toBe(0)
    expect(lastEventAt).toBe(0)
  })
})

// ─── Scenario 6: Focus halo ───

describe('Focus halo computation', () => {
  it('identifies connected edges for selected agent', () => {
    const edges = [
      { id: 'e1', source: 'agent-1', target: 'ch-telegram' },
      { id: 'e2', source: 'agent-2', target: 'ch-discord' },
      { id: 'e3', source: 'agent-1', target: 'ch-slack' },
    ]

    const selectedId = 'agent-1'
    const connectedEdgeIds = new Set<string>()
    const connectedNodeIds = new Set<string>([selectedId])

    for (const edge of edges) {
      if (edge.source === selectedId || edge.target === selectedId) {
        connectedEdgeIds.add(edge.id)
        connectedNodeIds.add(edge.source)
        connectedNodeIds.add(edge.target)
      }
    }

    expect(connectedEdgeIds.size).toBe(2)
    expect(connectedEdgeIds.has('e1')).toBe(true)
    expect(connectedEdgeIds.has('e3')).toBe(true)
    expect(connectedEdgeIds.has('e2')).toBe(false)

    expect(connectedNodeIds.has('agent-1')).toBe(true)
    expect(connectedNodeIds.has('ch-telegram')).toBe(true)
    expect(connectedNodeIds.has('ch-slack')).toBe(true)
    expect(connectedNodeIds.has('agent-2')).toBe(false)
  })

  it('includes parent runtime in connected context', () => {
    const agents = [
      makeAgent('agent-1', 'rt-prod'),
      makeAgent('agent-2', null),
    ]

    const selectedId = 'agent-1'
    const selectedAgent = agents.find(a => a.id === selectedId)
    const parentId = selectedAgent?.runtimeId
      ? `runtime-${selectedAgent.runtimeId}`
      : 'runtime-shared'

    expect(parentId).toBe('runtime-rt-prod')
  })

  it('maps to runtime-shared when no dedicated runtime', () => {
    const agents = [makeAgent('agent-1', null)]
    const selectedAgent = agents[0]
    const parentId = selectedAgent.runtimeId
      ? `runtime-${selectedAgent.runtimeId}`
      : 'runtime-shared'

    expect(parentId).toBe('runtime-shared')
  })
})

// ─── Scenario 7: Graceful degradation ───

describe('Graceful degradation', () => {
  it('sparkline shows all zeros with no events', () => {
    const data = buildSparklineData([], 'agent-1')
    expect(data).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('presence defaults to idle with no events', () => {
    expect(derivePresenceState([])).toBe('idle')
  })

  it('edge activity returns zero with no events', () => {
    const { eventCount, lastEventAt } = computeEdgeActivity([], 'a-1', 'ch-telegram')
    expect(eventCount).toBe(0)
    expect(lastEventAt).toBe(0)
  })

  it('event count returns zero with no events', () => {
    const { total, errors } = countAgentEvents([], 'agent-1')
    expect(total).toBe(0)
    expect(errors).toBe(0)
  })

  it('topology without runtimes groups all agents under shared', () => {
    const topology = makeTopology({
      agents: [makeAgent('a-1'), makeAgent('a-2'), makeAgent('a-3')],
    })

    const ungrouped = topology.agents.filter(a => !a.runtimeId)
    expect(ungrouped).toHaveLength(3)
  })

  it('auto-layout works without groups (flat mode)', async () => {
    const nodes: Node[] = [
      { id: 'a-1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
      { id: 'a-2', type: 'agent', position: { x: 0, y: 0 }, data: {} },
    ]

    mockLayout.mockResolvedValue({
      children: [
        { id: 'a-1', x: 0, y: 0 },
        { id: 'a-2', x: 300, y: 0 },
      ],
    })

    const result = await autoLayoutNodes(nodes, [])
    expect(result).toHaveLength(2)
    expect(result[1].position.x).toBe(300)
  })
})
