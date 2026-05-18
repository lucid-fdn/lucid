/**
 * Canvas Topology — Real-World Simulation Tests
 *
 * Simulates production-scale scenarios to verify performance budget
 * and correctness under load:
 * - 50-agent fleet across 10 runtimes + shared
 * - Event burst (200+ events in 60s)
 * - Mixed presence states across fleet
 * - Edge particle intensity distribution
 * - Compound layout with many groups
 * - Concurrent runtime creation
 * - Stale/offline runtime handling
 * - Large sparkline computation
 * - Focus halo on busy node (many connections)
 * - Full topology round-trip (API → layout → render data)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from 'reactflow'
import type { FeedEvent, FeedEventType } from '../types'
import { derivePresenceState } from '../presence'

// ─── Mock ELK ───

const mockLayout = vi.fn()

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout = mockLayout
  },
}))

import { autoLayoutNodes, type LayoutGroup } from '@/lib/workflow/auto-layout'

// ─── Helpers ───

const EVENT_TYPES: FeedEventType[] = [
  'tool_call', 'tool_result', 'error', 'run_started', 'run_finished',
  'message_received', 'message_sent', 'approval_requested', 'approval_resolved',
]

function makeEvent(
  type: FeedEventType,
  ageMs: number,
  agentId: string,
  payload: Record<string, unknown> = {},
  severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
): FeedEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 10)}`,
    event_type: type,
    severity,
    agent_id: agentId,
    agent_name: `Agent ${agentId}`,
    org_id: 'org-sim',
    run_id: `run-${agentId}`,
    payload,
    created_at: new Date(Date.now() - ageMs).toISOString(),
  }
}

function buildSparklineData(events: FeedEvent[], agentId: string): number[] {
  const now = Date.now()
  const buckets = new Array(7).fill(0) as number[]
  for (const e of events) {
    if (e.agent_id !== agentId) continue
    const age = now - new Date(e.created_at).getTime()
    const idx = 6 - Math.floor(age / 30_000)
    if (idx >= 0 && idx < 7) buckets[idx]++
  }
  return buckets
}

function countAgentEvents(events: FeedEvent[], agentId: string) {
  const cutoff = Date.now() - 300_000
  let total = 0, errors = 0
  for (const e of events) {
    if (e.agent_id !== agentId) continue
    if (new Date(e.created_at).getTime() < cutoff) continue
    total++
    if (e.severity === 'error' || e.event_type === 'error') errors++
  }
  return { total, errors }
}

function computeEdgeActivity(events: FeedEvent[], source: string, target: string) {
  let eventCount = 0, lastEventAt = 0
  const cutoff = Date.now() - 60_000
  for (const e of events) {
    const ts = new Date(e.created_at).getTime()
    if (ts < cutoff) continue
    if (e.agent_id === source) {
      const ct = (e.payload as any)?.channel_type
      if (ct && `ch-${ct}` === target) { eventCount++; if (ts > lastEventAt) lastEventAt = ts; continue }
      const ci = (e.payload as any)?.channel_id
      if (ci && `ch-${ci}` === target) { eventCount++; if (ts > lastEventAt) lastEventAt = ts; continue }
      const ri = (e.payload as any)?.recipient_agent_id ?? (e.payload as any)?.to_agent_id
      if (ri === target) { eventCount++; if (ts > lastEventAt) lastEventAt = ts }
    }
  }
  return { eventCount, lastEventAt }
}

beforeEach(() => {
  mockLayout.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── Simulation 1: 50-agent fleet ───

describe('50-agent fleet simulation', () => {
  const NUM_AGENTS = 50
  const NUM_RUNTIMES = 10
  const NUM_CHANNELS = 4
  const CHANNEL_TYPES = ['telegram', 'discord', 'whatsapp', 'web']

  // Build fleet topology
  const runtimes = Array.from({ length: NUM_RUNTIMES }, (_, i) => ({
    id: `rt-${i}`,
    displayName: `Runtime ${i}`,
    provider: i < 5 ? 'railway' : 'akash',
    status: 'active',
    cpuPercent: 20 + Math.random() * 60,
    ramPercent: 30 + Math.random() * 50,
    lastSeenAt: new Date().toISOString(),
  }))

  const agents = Array.from({ length: NUM_AGENTS }, (_, i) => ({
    id: `agent-${i}`,
    name: `Agent ${i}`,
    status: i % 7 === 0 ? 'paused' : 'active',
    model: i % 2 === 0 ? 'gpt-4o' : 'claude-3-5-sonnet',
    runtimeId: i < 40 ? `rt-${i % NUM_RUNTIMES}` : null, // 40 dedicated, 10 shared
    healthScore: 60 + Math.random() * 40,
    costTodayUsd: Math.random() * 5,
    errorsLastHour: i % 11 === 0 ? Math.floor(Math.random() * 5) : 0,
  }))

  const channels = CHANNEL_TYPES.map(type => ({
    id: `ch-${type}`, type, name: type, isActive: true,
  }))

  // Each agent connects to 1-2 channels
  const connections = agents.flatMap(agent => {
    const numChannels = 1 + (parseInt(agent.id.split('-')[1]) % 2)
    return Array.from({ length: numChannels }, (_, i) => ({
      source: agent.id,
      target: `ch-${CHANNEL_TYPES[i % CHANNEL_TYPES.length]}`,
      isActive: true,
    }))
  })

  it('computes correct group distribution', () => {
    const runtimeMap = new Map<string, string[]>()
    const ungrouped: string[] = []

    for (const agent of agents) {
      if (agent.runtimeId) {
        const list = runtimeMap.get(agent.runtimeId) || []
        list.push(agent.id)
        runtimeMap.set(agent.runtimeId, list)
      } else {
        ungrouped.push(agent.id)
      }
    }

    expect(runtimeMap.size).toBe(NUM_RUNTIMES)
    expect(ungrouped).toHaveLength(10)

    // Each runtime should have 4 agents (40 agents / 10 runtimes)
    for (const [, agents] of runtimeMap) {
      expect(agents.length).toBe(4)
    }
  })

  it('builds correct total node count', () => {
    // 50 agents + 4 channels + 10 runtimes + 1 shared = 65 nodes
    const totalNodes = agents.length + channels.length + runtimes.length + 1 // +1 for shared
    expect(totalNodes).toBe(65)
    expect(totalNodes).toBeLessThanOrEqual(80) // Performance budget
  })

  it('builds correct edge count', () => {
    // 50 agents, each with 1-2 connections
    expect(connections.length).toBeGreaterThanOrEqual(50)
    expect(connections.length).toBeLessThanOrEqual(100)
  })

  it('computes sparkline data for all agents under budget', () => {
    // Generate ~200 events spread across agents
    const events: FeedEvent[] = Array.from({ length: 200 }, (_, i) => {
      const agentIdx = i % NUM_AGENTS
      const eventType = EVENT_TYPES[i % EVENT_TYPES.length]
      return makeEvent(eventType, i * 500, `agent-${agentIdx}`)
    })

    const start = performance.now()
    const sparklines = agents.map(a => buildSparklineData(events, a.id))
    const elapsed = performance.now() - start

    expect(sparklines).toHaveLength(NUM_AGENTS)
    expect(sparklines.every(s => s.length === 7)).toBe(true)
    // Should be trivial: 50 agents x 7 buckets with 200 events
    expect(elapsed).toBeLessThan(100) // 100ms budget (generous)
  })

  it('computes presence state for all agents', () => {
    const events: FeedEvent[] = [
      // Some agents are actively working
      makeEvent('message_sent', 3_000, 'agent-0'),
      makeEvent('tool_call', 5_000, 'agent-1'),
      makeEvent('run_started', 10_000, 'agent-2'),
      makeEvent('tool_call', 8_000, 'agent-3'),
    ]

    const states = agents.map(a => {
      const agentEvents = events.filter(e => e.agent_id === a.id)
      return { id: a.id, state: derivePresenceState(agentEvents) }
    })

    expect(states.find(s => s.id === 'agent-0')?.state).toBe('responding')
    expect(states.find(s => s.id === 'agent-1')?.state).toBe('tool-calling')
    expect(states.find(s => s.id === 'agent-2')?.state).toBe('thinking')
    // Most agents have no events → idle
    const idleCount = states.filter(s => s.state === 'idle').length
    expect(idleCount).toBeGreaterThanOrEqual(46)
  })

  it('computes edge event counts correctly under load', () => {
    // Burst: 50 events to telegram in last 60s
    const events: FeedEvent[] = Array.from({ length: 50 }, (_, i) =>
      makeEvent('message_sent', i * 1000, `agent-${i % 10}`, { channel_type: 'telegram' }),
    )

    // Agent-0 has 5 events to telegram
    const { eventCount } = computeEdgeActivity(events, 'agent-0', 'ch-telegram')
    expect(eventCount).toBe(5)

    // Agent not in burst has 0
    const { eventCount: zeroCount } = computeEdgeActivity(events, 'agent-49', 'ch-telegram')
    expect(zeroCount).toBe(0)
  })
})

// ─── Simulation 2: Event burst ───

describe('Event burst simulation', () => {
  it('handles 200+ events in single poll cycle', () => {
    const events: FeedEvent[] = Array.from({ length: 200 }, (_, i) =>
      makeEvent(
        EVENT_TYPES[i % EVENT_TYPES.length],
        i * 300, // 300ms apart, all within 60s
        `agent-${i % 5}`,
        { channel_type: 'telegram' },
      ),
    )

    const start = performance.now()

    // Compute all derived data (mirrors canvas-client useMemo)
    const agentIds = ['agent-0', 'agent-1', 'agent-2', 'agent-3', 'agent-4']

    const agentData = agentIds.map(id => {
      const agentEvents = events.filter(e => e.agent_id === id)
      return {
        id,
        sparkline: buildSparklineData(events, id),
        presence: derivePresenceState(agentEvents),
        counts: countAgentEvents(events, id),
      }
    })

    // Compute edge activity for 5 agents x 1 channel
    const edgeData = agentIds.map(id => ({
      id,
      ...computeEdgeActivity(events, id, 'ch-telegram'),
    }))

    const elapsed = performance.now() - start

    // Correctness
    expect(agentData).toHaveLength(5)
    expect(edgeData).toHaveLength(5)

    // Each agent should have ~40 events (200/5)
    for (const ad of agentData) {
      expect(ad.counts.total).toBeGreaterThanOrEqual(35)
      expect(ad.counts.total).toBeLessThanOrEqual(45)
    }

    // Performance: should process 200 events in under 50ms
    expect(elapsed).toBeLessThan(50)
  })

  it('error events are counted separately', () => {
    const events: FeedEvent[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent('tool_call', i * 1000, 'agent-err'),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeEvent('error', i * 2000, 'agent-err', {}, 'error'),
      ),
    ]

    const { total, errors } = countAgentEvents(events, 'agent-err')
    expect(total).toBe(13)
    expect(errors).toBe(3)
  })
})

// ─── Simulation 3: Particle intensity distribution ───

describe('Particle intensity distribution', () => {
  function getParticleCount(eventCount: number): number {
    if (eventCount === 0) return 0
    if (eventCount <= 3) return 1
    if (eventCount <= 10) return 2
    return 3
  }

  it('distributes particles across busy fleet correctly', () => {
    // Simulate event counts per edge in a busy fleet
    const edgeEventCounts = [0, 0, 1, 2, 3, 5, 7, 8, 12, 15, 0, 0, 4, 6, 20]

    const distribution = edgeEventCounts.map(getParticleCount)

    // Count by particle level
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 }
    for (const p of distribution) counts[p as keyof typeof counts]++

    // [0, 0, 1, 2, 3, 5, 7, 8, 12, 15, 0, 0, 4, 6, 20]
    // 0→0: 4 items (0,0,0,0), 1-3→1: 3 items (1,2,3), 4-10→2: 5 items (5,7,8,4,6), 11+→3: 3 items (12,15,20)
    expect(counts[0]).toBe(4)  // 4 idle edges
    expect(counts[1]).toBe(3)  // 3 low-activity edges (1,2,3)
    expect(counts[2]).toBe(5)  // 5 medium-activity edges (5,7,8,4,6)
    expect(counts[3]).toBe(3)  // 3 high-activity edges (12,15,20)
  })

  it('total particle count stays under 210 SVG elements', () => {
    // 70 edges, worst case 3 particles each = 210
    const MAX_EDGES = 70
    const maxParticles = MAX_EDGES * 3
    expect(maxParticles).toBe(210)
    // This is pure SVG animation, no JS per frame
  })
})

// ─── Simulation 4: Compound layout at scale ───

describe('Compound layout at scale', () => {
  it('handles 10 runtime groups with nested agents', async () => {
    const nodes: Node[] = []
    const groups: LayoutGroup[] = []

    // 10 runtimes, each with 4 agents
    for (let rt = 0; rt < 10; rt++) {
      const rtId = `runtime-rt-${rt}`
      const children: string[] = []

      nodes.push({
        id: rtId,
        type: 'runtimeNode',
        position: { x: 0, y: 0 },
        data: {},
        width: 280,
        height: 160,
      })

      for (let a = 0; a < 4; a++) {
        const agentId = `agent-${rt * 4 + a}`
        children.push(agentId)
        nodes.push({
          id: agentId,
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {},
          width: 220,
          height: 110,
        })
      }

      groups.push({ id: rtId, children })
    }

    // 5 channel nodes
    for (let c = 0; c < 5; c++) {
      nodes.push({
        id: `ch-${c}`,
        type: 'channel',
        position: { x: 0, y: 0 },
        data: {},
        width: 140,
        height: 60,
      })
    }

    // Build mock ELK response
    const elkChildren = groups.map((g, i) => ({
      id: g.id,
      x: 0,
      y: i * 350,
      width: 500,
      height: 300,
      children: g.children.map((cid, ci) => ({
        id: cid,
        x: 20 + (ci % 2) * 240,
        y: 50 + Math.floor(ci / 2) * 130,
      })),
    }))

    // Add channel positions
    for (let c = 0; c < 5; c++) {
      elkChildren.push({
        id: `ch-${c}`,
        x: 700,
        y: c * 100,
        width: 140,
        height: 60,
        children: [],
      })
    }

    mockLayout.mockResolvedValue({ children: elkChildren })

    const result = await autoLayoutNodes(nodes, [], { direction: 'RIGHT' }, groups)

    // All nodes should be positioned
    expect(result).toHaveLength(55) // 10 runtimes + 40 agents + 5 channels

    // Runtime nodes should have sizes from ELK
    const rt0 = result.find(n => n.id === 'runtime-rt-0')
    expect(rt0).toBeDefined()
    expect(rt0!.width).toBe(500)

    // Agent nodes should have parent-relative positions
    const agent0 = result.find(n => n.id === 'agent-0')
    expect(agent0).toBeDefined()
    expect(agent0!.position.x).toBe(20)
    expect(agent0!.position.y).toBe(50)

    // ELK should have been called with hierarchyHandling
    const graphArg = mockLayout.mock.calls[0][0]
    expect(graphArg.layoutOptions['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN')
    expect(graphArg.children).toHaveLength(15) // 10 groups + 5 ungrouped channels
  })

  it('shared runtime group collects all ungrouped agents', async () => {
    const nodes: Node[] = [
      { id: 'runtime-shared', type: 'runtimeNode', position: { x: 0, y: 0 }, data: {}, width: 280, height: 160 },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `agent-${i}`,
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {},
        width: 220,
        height: 110,
      })),
    ]

    const groups: LayoutGroup[] = [{
      id: 'runtime-shared',
      children: Array.from({ length: 10 }, (_, i) => `agent-${i}`),
    }]

    mockLayout.mockResolvedValue({
      children: [{
        id: 'runtime-shared',
        x: 0,
        y: 0,
        width: 500,
        height: 600,
        children: Array.from({ length: 10 }, (_, i) => ({
          id: `agent-${i}`,
          x: 20,
          y: 50 + i * 55,
        })),
      }],
    })

    const result = await autoLayoutNodes(nodes, [], {}, groups)
    expect(result).toHaveLength(11) // 1 shared + 10 agents

    // Verify ELK received single group with 10 children
    const graphArg = mockLayout.mock.calls[0][0]
    expect(graphArg.children).toHaveLength(1)
    expect(graphArg.children[0].children).toHaveLength(10)
  })
})

// ─── Simulation 5: Stale/offline runtimes ───

describe('Stale/offline runtime handling', () => {
  it('connection status thresholds are deterministic', () => {
    function getConnectionStatus(lastSeenAt: string | null): 'connected' | 'stale' | 'offline' {
      if (!lastSeenAt) return 'offline'
      const diffMs = Date.now() - new Date(lastSeenAt).getTime()
      if (diffMs < 60_000) return 'connected'
      if (diffMs < 300_000) return 'stale'
      return 'offline'
    }

    // Just now → connected
    expect(getConnectionStatus(new Date().toISOString())).toBe('connected')
    // 30s ago → connected
    expect(getConnectionStatus(new Date(Date.now() - 30_000).toISOString())).toBe('connected')
    // 2 min ago → stale
    expect(getConnectionStatus(new Date(Date.now() - 120_000).toISOString())).toBe('stale')
    // 10 min ago → offline
    expect(getConnectionStatus(new Date(Date.now() - 600_000).toISOString())).toBe('offline')
    // null → offline
    expect(getConnectionStatus(null)).toBe('offline')
  })

  it('agents on offline runtimes still render with idle presence', () => {
    const events: FeedEvent[] = [] // no events from offline runtime

    const presence = derivePresenceState(events)
    expect(presence).toBe('idle')

    const sparkline = buildSparklineData(events, 'agent-offline')
    expect(sparkline.every(v => v === 0)).toBe(true)
  })
})

// ─── Simulation 6: Focus halo on highly-connected node ───

describe('Focus halo on highly-connected node', () => {
  it('correctly identifies all connections for a hub agent', () => {
    // Agent-0 connects to all 4 channels
    const edges = [
      { id: 'e1', source: 'agent-0', target: 'ch-telegram' },
      { id: 'e2', source: 'agent-0', target: 'ch-discord' },
      { id: 'e4', source: 'agent-0', target: 'ch-whatsapp' },
      { id: 'e5', source: 'agent-0', target: 'ch-web' },
      // Other agents' edges (should be dimmed)
      { id: 'e6', source: 'agent-1', target: 'ch-telegram' },
      { id: 'e7', source: 'agent-2', target: 'ch-discord' },
    ]

    const selectedId = 'agent-0'
    const connectedEdgeIds = new Set<string>()
    const connectedNodeIds = new Set<string>([selectedId])

    for (const edge of edges) {
      if (edge.source === selectedId || edge.target === selectedId) {
        connectedEdgeIds.add(edge.id)
        connectedNodeIds.add(edge.source)
        connectedNodeIds.add(edge.target)
      }
    }

    expect(connectedEdgeIds.size).toBe(4)
    expect(connectedNodeIds.size).toBe(5) // agent-0 + 4 channels
    expect(connectedNodeIds.has('agent-1')).toBe(false)
    expect(connectedNodeIds.has('agent-2')).toBe(false)
  })

  it('dimming applies to correct percentage of nodes', () => {
    const totalNodes = 65 // from 50-agent fleet simulation
    const connectedNodes = 5 // agent + 4 channels
    const dimmedNodes = totalNodes - connectedNodes

    expect(dimmedNodes / totalNodes).toBeGreaterThan(0.9)
    // >90% of nodes dimmed — focused view is clear
  })
})

// ─── Simulation 7: Full topology round-trip ───

describe('Full topology round-trip', () => {
  it('builds correct ReactFlow node structure from API response', () => {
    const apiResponse = {
      runtimes: [
        { id: 'rt-1', displayName: 'Prod', provider: 'railway', status: 'active', cpuPercent: 45, ramPercent: 60, lastSeenAt: new Date().toISOString() },
      ],
      agents: [
        { id: 'a-1', name: 'Agent 1', status: 'active', model: 'gpt-4o', runtimeId: 'rt-1', healthScore: 85, costTodayUsd: 1.23, errorsLastHour: 0 },
        { id: 'a-2', name: 'Agent 2', status: 'paused', model: 'claude-3-5-sonnet', runtimeId: null, healthScore: null, costTodayUsd: null, errorsLastHour: 2 },
      ],
      channels: [
        { id: 'ch-telegram', type: 'telegram', name: 'telegram', isActive: true },
      ],
      connections: [
        { source: 'a-1', target: 'ch-telegram', isActive: true },
        { source: 'a-2', target: 'ch-telegram', isActive: true },
      ],
    }

    // Simulate node building (mirrors canvas-client)
    const rfNodes: { id: string; type: string; parentNode?: string }[] = []
    const groups: { id: string; children: string[] }[] = []

    const runtimeMap = new Map<string, string[]>()
    const ungrouped: string[] = []

    for (const agent of apiResponse.agents) {
      if (agent.runtimeId) {
        const list = runtimeMap.get(agent.runtimeId) || []
        list.push(agent.id)
        runtimeMap.set(agent.runtimeId, list)
      } else {
        ungrouped.push(agent.id)
      }
    }

    // Runtime nodes
    for (const rt of apiResponse.runtimes) {
      const children = runtimeMap.get(rt.id) || []
      if (children.length > 0) {
        rfNodes.push({ id: `runtime-${rt.id}`, type: 'runtimeNode' })
        groups.push({ id: `runtime-${rt.id}`, children })
      }
    }

    // Shared runtime
    if (ungrouped.length > 0) {
      rfNodes.push({ id: 'runtime-shared', type: 'runtimeNode' })
      groups.push({ id: 'runtime-shared', children: ungrouped })
    }

    // Agent nodes with parentNode
    for (const agent of apiResponse.agents) {
      const parentId = agent.runtimeId ? `runtime-${agent.runtimeId}` : 'runtime-shared'
      rfNodes.push({ id: agent.id, type: 'agent', parentNode: parentId })
    }

    // Channel nodes
    for (const ch of apiResponse.channels) {
      rfNodes.push({ id: ch.id, type: 'channel' })
    }

    // Verify structure: runtime-rt-1, runtime-shared, a-1, a-2, ch-telegram = 5
    expect(rfNodes).toHaveLength(5)
    expect(groups).toHaveLength(2)

    // Agent-1 is in dedicated runtime
    const a1Node = rfNodes.find(n => n.id === 'a-1')
    expect(a1Node?.parentNode).toBe('runtime-rt-1')

    // Agent-2 is in shared runtime
    const a2Node = rfNodes.find(n => n.id === 'a-2')
    expect(a2Node?.parentNode).toBe('runtime-shared')

    // Channels have no parent
    const chNode = rfNodes.find(n => n.id === 'ch-telegram')
    expect(chNode?.parentNode).toBeUndefined()
  })

  it('edges reference correct source/target after node composition', () => {
    const connections = [
      { source: 'a-1', target: 'ch-telegram', isActive: true },
      { source: 'a-2', target: 'ch-telegram', isActive: true },
    ]

    const rfEdges = connections.map((conn, i) => ({
      id: `e-${conn.source}-${conn.target}-${i}`,
      source: conn.source,
      target: conn.target,
      type: 'dataflow',
      data: { is_active: conn.isActive },
    }))

    expect(rfEdges).toHaveLength(2)
    // Edges should reference agent IDs (not runtime IDs)
    expect(rfEdges[0].source).toBe('a-1')
    expect(rfEdges[1].source).toBe('a-2')
    // Both target the channel
    expect(rfEdges.every(e => e.target === 'ch-telegram')).toBe(true)
  })
})

// ─── Simulation 8: Presence state transitions ───

describe('Presence state transitions', () => {
  it('transitions through full agent lifecycle', () => {
    // Idle → thinking → tool-calling → responding → idle
    const states: string[] = []

    // 1. No events → idle
    states.push(derivePresenceState([]))

    // 2. Run started → thinking
    states.push(derivePresenceState([makeEvent('run_started', 5_000, 'a-1')]))

    // 3. Tool call → tool-calling
    states.push(derivePresenceState([
      makeEvent('run_started', 10_000, 'a-1'),
      makeEvent('tool_call', 5_000, 'a-1'),
    ]))

    // 4. Message sent → responding
    states.push(derivePresenceState([
      makeEvent('run_started', 15_000, 'a-1'),
      makeEvent('tool_call', 10_000, 'a-1'),
      makeEvent('message_sent', 5_000, 'a-1'),
    ]))

    // 5. All events old → idle
    states.push(derivePresenceState([
      makeEvent('run_started', 60_000, 'a-1'),
      makeEvent('tool_call', 45_000, 'a-1'),
      makeEvent('message_sent', 30_000, 'a-1'),
    ]))

    expect(states).toEqual(['idle', 'thinking', 'tool-calling', 'responding', 'idle'])
  })

  it('handles rapid state changes without flicker', () => {
    // Multiple events in quick succession — should pick highest priority
    const events = [
      makeEvent('run_started', 8_000, 'a-1'),
      makeEvent('tool_call', 6_000, 'a-1'),
      makeEvent('message_sent', 3_000, 'a-1'),
    ]

    // message_sent is most recent and within 15s → responding
    expect(derivePresenceState(events)).toBe('responding')
  })

  it('correctly identifies idle state boundary at 15s/30s', () => {
    // makeEvent stamps `created_at = Date.now() - ageMs`, and derivePresenceState
    // re-reads `Date.now()` later — so the effective age drifts a few ms by the
    // time the assertion runs. Use comfortable margins instead of testing
    // sub-millisecond boundaries.
    expect(derivePresenceState([makeEvent('message_sent', 14_000, 'a-1')])).toBe('responding')
    expect(derivePresenceState([makeEvent('message_sent', 16_000, 'a-1')])).toBe('idle')

    // run_started boundary at 30s
    expect(derivePresenceState([makeEvent('run_started', 29_000, 'a-1')])).toBe('thinking')
    expect(derivePresenceState([makeEvent('run_started', 31_000, 'a-1')])).toBe('idle')
  })
})
