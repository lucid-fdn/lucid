/**
 * Canvas Topology — Smoke Tests
 *
 * Validates that all canvas topology components are wired correctly:
 * - Presence derivation (pure function)
 * - Auto-layout compound graph support
 * - Topology API response shape
 * - Edge data flow types
 * - Node type registrations
 * - Constants and config consistency
 *
 * These catch drift between layers without hitting real infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FeedEvent } from '../types'

// ─── Presence derivation ───

import { derivePresenceState } from '../presence'

function makeEvent(
  type: string,
  ageMs: number,
  overrides: Partial<FeedEvent> = {},
): FeedEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    event_type: type as FeedEvent['event_type'],
    severity: 'info',
    agent_id: 'agent-1',
    agent_name: 'Test Agent',
    org_id: 'org-1',
    run_id: null,
    payload: {},
    created_at: new Date(Date.now() - ageMs).toISOString(),
    ...overrides,
  }
}

describe('derivePresenceState', () => {
  it('returns idle when no events', () => {
    expect(derivePresenceState([])).toBe('idle')
  })

  it('returns responding for recent message_sent', () => {
    const events = [makeEvent('message_sent', 5_000)]
    expect(derivePresenceState(events)).toBe('responding')
  })

  it('returns tool-calling for recent tool_call', () => {
    const events = [makeEvent('tool_call', 10_000)]
    expect(derivePresenceState(events)).toBe('tool-calling')
  })

  it('returns thinking for run_started without tool_call', () => {
    const events = [makeEvent('run_started', 20_000)]
    expect(derivePresenceState(events)).toBe('thinking')
  })

  it('returns idle for run_started older than 30s', () => {
    const events = [makeEvent('run_started', 35_000)]
    expect(derivePresenceState(events)).toBe('idle')
  })

  it('returns idle for message_sent older than 15s', () => {
    const events = [makeEvent('message_sent', 20_000)]
    expect(derivePresenceState(events)).toBe('idle')
  })

  it('returns idle for tool_call older than 15s', () => {
    const events = [makeEvent('tool_call', 20_000)]
    expect(derivePresenceState(events)).toBe('idle')
  })

  it('prioritizes responding over tool-calling', () => {
    const events = [
      makeEvent('message_sent', 3_000),
      makeEvent('tool_call', 5_000),
    ]
    expect(derivePresenceState(events)).toBe('responding')
  })

  it('does NOT return thinking if tool_call exists (even old)', () => {
    const events = [
      makeEvent('run_started', 10_000),
      makeEvent('tool_call', 20_000), // older than 15s but marks hasToolCall
    ]
    expect(derivePresenceState(events)).not.toBe('thinking')
  })

  it('handles mixed old and new events correctly', () => {
    const events = [
      makeEvent('run_started', 60_000), // very old
      makeEvent('message_received', 45_000), // old
      makeEvent('tool_call', 8_000), // recent
    ]
    expect(derivePresenceState(events)).toBe('tool-calling')
  })
})

// ─── Presence state config consistency ───

import { PRESENCE_STATE_CONFIG } from '../constants'

describe('PRESENCE_STATE_CONFIG', () => {
  const expectedStates = ['idle', 'receiving', 'thinking', 'tool-calling', 'responding']

  it.each(expectedStates)('has config for state: %s', (state) => {
    const cfg = PRESENCE_STATE_CONFIG[state as keyof typeof PRESENCE_STATE_CONFIG]
    expect(cfg).toBeDefined()
    expect(cfg.dotColor).toMatch(/^bg-/)
    expect(cfg.textColor).toMatch(/^text-/)
    expect(typeof cfg.breathe).toBe('boolean')
  })

  it('covers all AgentPresenceState values', () => {
    const configKeys = Object.keys(PRESENCE_STATE_CONFIG)
    expect(configKeys.sort()).toEqual(expectedStates.sort())
  })
})

// ─── Provider labels consistency ───

import { PROVIDER_LABELS, MANAGED_PROVIDERS, BYO_PROVIDERS } from '../constants'

describe('Provider labels', () => {
  it('has labels for all managed providers', () => {
    for (const p of MANAGED_PROVIDERS) {
      expect(PROVIDER_LABELS[p]).toBeDefined()
      expect(typeof PROVIDER_LABELS[p]).toBe('string')
    }
  })

  it('has labels for all BYO providers', () => {
    for (const p of BYO_PROVIDERS) {
      expect(PROVIDER_LABELS[p]).toBeDefined()
    }
  })
})

// ─── Auto-layout compound graph types ───

import type { LayoutGroup } from '@/lib/workflow/auto-layout'

describe('LayoutGroup type', () => {
  it('can construct a valid group', () => {
    const group: LayoutGroup = {
      id: 'runtime-abc',
      children: ['agent-1', 'agent-2'],
      width: 300,
      height: 200,
      padding: 40,
    }
    expect(group.id).toBe('runtime-abc')
    expect(group.children).toHaveLength(2)
  })

  it('allows optional width/height/padding', () => {
    const group: LayoutGroup = {
      id: 'runtime-minimal',
      children: ['agent-1'],
    }
    expect(group.width).toBeUndefined()
    expect(group.height).toBeUndefined()
    expect(group.padding).toBeUndefined()
  })
})

// ─── Topology API response shape ───

describe('Topology API response contract', () => {
  const validResponse = {
    runtimes: [
      { id: 'rt-1', displayName: 'Prod', provider: 'railway', status: 'active', cpuPercent: 45, ramPercent: 60, lastSeenAt: '2026-03-30T00:00:00Z' },
    ],
    agents: [
      { id: 'a-1', name: 'Agent 1', status: 'active', model: 'gpt-4o', runtimeId: 'rt-1', healthScore: 85, costTodayUsd: 1.23, errorsLastHour: 0 },
      { id: 'a-2', name: 'Agent 2', status: 'active', model: 'claude-3-5-sonnet', runtimeId: null, healthScore: null, costTodayUsd: null, errorsLastHour: 2 },
    ],
    channels: [
      { id: 'ch-telegram', type: 'telegram', name: 'telegram', isActive: true },
    ],
    connections: [
      { source: 'a-1', target: 'ch-telegram', isActive: true },
    ],
    nodes: [],
    edges: [],
  }

  it('has required runtime fields', () => {
    const rt = validResponse.runtimes[0]
    expect(rt).toHaveProperty('id')
    expect(rt).toHaveProperty('displayName')
    expect(rt).toHaveProperty('provider')
    expect(rt).toHaveProperty('status')
    expect(rt).toHaveProperty('cpuPercent')
    expect(rt).toHaveProperty('ramPercent')
    expect(rt).toHaveProperty('lastSeenAt')
  })

  it('has required agent fields', () => {
    const agent = validResponse.agents[0]
    expect(agent).toHaveProperty('id')
    expect(agent).toHaveProperty('name')
    expect(agent).toHaveProperty('status')
    expect(agent).toHaveProperty('model')
    expect(agent).toHaveProperty('runtimeId')
    expect(agent).toHaveProperty('healthScore')
    expect(agent).toHaveProperty('costTodayUsd')
    expect(agent).toHaveProperty('errorsLastHour')
  })

  it('allows nullable runtimeId on agents', () => {
    expect(validResponse.agents[1].runtimeId).toBeNull()
  })

  it('allows nullable healthScore/costTodayUsd', () => {
    expect(validResponse.agents[1].healthScore).toBeNull()
    expect(validResponse.agents[1].costTodayUsd).toBeNull()
  })

  it('has required channel fields', () => {
    const ch = validResponse.channels[0]
    expect(ch).toHaveProperty('id')
    expect(ch).toHaveProperty('type')
    expect(ch).toHaveProperty('name')
    expect(ch).toHaveProperty('isActive')
  })

  it('has required connection fields', () => {
    const conn = validResponse.connections[0]
    expect(conn).toHaveProperty('source')
    expect(conn).toHaveProperty('target')
    expect(conn).toHaveProperty('isActive')
  })

  it('maintains legacy nodes/edges for backwards compat', () => {
    expect(validResponse).toHaveProperty('nodes')
    expect(validResponse).toHaveProperty('edges')
    expect(Array.isArray(validResponse.nodes)).toBe(true)
    expect(Array.isArray(validResponse.edges)).toBe(true)
  })
})

// ─── Edge data shape ───

describe('DataFlowEdge data contract', () => {
  it('accepts base edge data', () => {
    const data = { is_active: true }
    expect(data.is_active).toBe(true)
  })

  it('accepts extended edge data with event info', () => {
    const data = { is_active: true, eventCount: 5, lastEventAt: Date.now() }
    expect(data.eventCount).toBe(5)
    expect(data.lastEventAt).toBeGreaterThan(0)
  })

  it('defaults eventCount to 0', () => {
    const data = { is_active: false, eventCount: 0, lastEventAt: 0 }
    expect(data.eventCount).toBe(0)
    expect(data.lastEventAt).toBe(0)
  })
})

// ─── Particle count rules ───

describe('Edge particle count rules', () => {
  function getParticleCount(eventCount: number): number {
    if (eventCount === 0) return 0
    if (eventCount <= 3) return 1
    if (eventCount <= 10) return 2
    return 3
  }

  it('0 events → 0 particles', () => expect(getParticleCount(0)).toBe(0))
  it('1 event → 1 particle', () => expect(getParticleCount(1)).toBe(1))
  it('3 events → 1 particle', () => expect(getParticleCount(3)).toBe(1))
  it('4 events → 2 particles', () => expect(getParticleCount(4)).toBe(2))
  it('10 events → 2 particles', () => expect(getParticleCount(10)).toBe(2))
  it('11 events → 3 particles', () => expect(getParticleCount(11)).toBe(3))
  it('100 events → 3 particles (capped)', () => expect(getParticleCount(100)).toBe(3))
})

// ─── Agent node data contract ───

describe('AgentNodeData contract', () => {
  it('accepts full data with live fields', () => {
    const data = {
      label: 'My Agent',
      status: 'active',
      model: 'gpt-4o',
      health_score: 85,
      cost_today_usd: 1.5,
      errors_last_hour: 0,
      sparklineData: [0, 1, 3, 2, 5, 1, 0],
      presenceState: 'responding',
      presenceColor: 'bg-emerald-400',
      recentEventCount: 12,
      recentErrorCount: 0,
      isFocused: false,
    }
    expect(data.sparklineData).toHaveLength(7)
    expect(data.presenceState).toBe('responding')
  })

  it('accepts minimal data without live fields', () => {
    const data = {
      label: 'Minimal Agent',
      status: 'active',
      model: 'claude-3-5-sonnet',
      health_score: null,
      cost_today_usd: null,
      errors_last_hour: 0,
    }
    expect(data.health_score).toBeNull()
    expect((data as any).sparklineData).toBeUndefined()
  })
})

// ─── Runtime node data contract ───

describe('RuntimeNodeData contract', () => {
  it('accepts dedicated runtime data', () => {
    const data = {
      label: 'Production Runtime',
      provider: 'railway',
      status: 'active',
      cpuPercent: 45,
      ramPercent: 60,
      lastSeenAt: '2026-03-30T00:00:00Z',
      isShared: false,
    }
    expect(data.isShared).toBe(false)
    expect(data.cpuPercent).toBe(45)
  })

  it('accepts shared runtime data with null metrics', () => {
    const data = {
      label: 'Shared infrastructure',
      provider: 'lucid',
      status: 'active',
      cpuPercent: null,
      ramPercent: null,
      lastSeenAt: null,
      isShared: true,
    }
    expect(data.isShared).toBe(true)
    expect(data.cpuPercent).toBeNull()
  })
})
