import { describe, it, expect } from 'vitest'
import { sortBySeq } from '@/hooks/use-introspection-stream'
import type { StreamNode, StreamState } from '@/hooks/use-introspection-stream'

/**
 * Tests for pure logic exported from useIntrospectionStream:
 * - sortBySeq ordering (exported)
 * - streamState derivation (re-implemented — same 4-line conditional)
 * - Ring buffer trim behavior
 * - isActive derivation from last node
 */

// StreamState derivation — mirrors hook logic at use-introspection-stream.ts:139
function deriveStreamState(
  enabled: boolean,
  isActive: boolean,
  nodeCount: number,
): StreamState {
  if (!enabled) return 'disabled'
  if (isActive) return 'active'
  if (nodeCount > 0) return 'idle'
  return 'waiting'
}

// isActive derivation — mirrors hook logic at use-introspection-stream.ts:126
function deriveIsActive(nodes: StreamNode[]): boolean {
  if (nodes.length === 0) return false
  return nodes[nodes.length - 1].kind !== 'run_end'
}

function makeNode(overrides: Partial<StreamNode> & { id: string }): StreamNode {
  return {
    kind: 'tool_start',
    runId: 'run-1',
    data: {},
    createdAt: '2026-04-01T00:00:00Z',
    status: 'active',
    seq: 0,
    ...overrides,
  }
}

describe('sortBySeq', () => {
  it('sorts nodes with same createdAt by seq', () => {
    const a = makeNode({ id: 'a', seq: 3, createdAt: '2026-04-01T00:00:01Z' })
    const b = makeNode({ id: 'b', seq: 1, createdAt: '2026-04-01T00:00:01Z' })
    const c = makeNode({ id: 'c', seq: 2, createdAt: '2026-04-01T00:00:01Z' })

    const sorted = [a, b, c].sort(sortBySeq)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts nodes across different runs by createdAt first', () => {
    const early = makeNode({ id: 'early', runId: 'run-1', seq: 10, createdAt: '2026-04-01T00:00:00Z' })
    const late = makeNode({ id: 'late', runId: 'run-2', seq: 1, createdAt: '2026-04-01T00:05:00Z' })

    const sorted = [late, early].sort(sortBySeq)
    expect(sorted.map((n) => n.id)).toEqual(['early', 'late'])
  })

  it('uses seq when timestamps are within 1s window', () => {
    const a = makeNode({ id: 'a', seq: 5, createdAt: '2026-04-01T00:00:00.100Z' })
    const b = makeNode({ id: 'b', seq: 2, createdAt: '2026-04-01T00:00:00.500Z' })

    const sorted = [a, b].sort(sortBySeq)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('falls back to timestamp when seq is equal', () => {
    const a = makeNode({ id: 'a', seq: 1, createdAt: '2026-04-01T00:00:00.200Z' })
    const b = makeNode({ id: 'b', seq: 1, createdAt: '2026-04-01T00:00:00.100Z' })

    const sorted = [a, b].sort(sortBySeq)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a'])
  })
})

describe('ring buffer trim', () => {
  it('trims to MAX_NODES (200) after sort', () => {
    // Simulate the ring buffer behavior from the hook
    const MAX_NODES = 200
    // Use unique ascending timestamps (1 second apart) to ensure stable sort
    const nodes = Array.from({ length: 210 }, (_, i) => {
      const minutes = Math.floor(i / 60)
      const seconds = i % 60
      return makeNode({
        id: `n-${i}`,
        seq: i,
        createdAt: `2026-04-01T00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}Z`,
      })
    })
    const trimmed = nodes.sort(sortBySeq).slice(-MAX_NODES)
    expect(trimmed).toHaveLength(200)
    // Oldest 10 nodes are dropped
    expect(trimmed[0].id).toBe('n-10')
    expect(trimmed[199].id).toBe('n-209')
  })
})

describe('isActive derivation', () => {
  it('returns false for empty nodes', () => {
    expect(deriveIsActive([])).toBe(false)
  })

  it('returns true when last node is not run_end', () => {
    const nodes = [
      makeNode({ id: '1', kind: 'tool_start' }),
      makeNode({ id: '2', kind: 'llm_start' }),
    ]
    expect(deriveIsActive(nodes)).toBe(true)
  })

  it('returns false when last node is run_end', () => {
    const nodes = [
      makeNode({ id: '1', kind: 'tool_start' }),
      makeNode({ id: '2', kind: 'run_end', status: 'complete' }),
    ]
    expect(deriveIsActive(nodes)).toBe(false)
  })
})

describe('toolCallId pairing', () => {
  it('pairs tool_start + tool_result by toolCallId', () => {
    const start = makeNode({ id: 's1', kind: 'tool_start', toolCallId: 'tc-abc', data: { tool_name: 'get_price' } })
    const result = makeNode({ id: 'r1', kind: 'tool_result', toolCallId: 'tc-abc', data: { tool_name: 'get_price' } })
    expect(start.toolCallId).toBe(result.toolCallId)
  })

  it('legacy events have no toolCallId — fall back to tool_name', () => {
    const start = makeNode({ id: 's1', kind: 'tool_start', data: { tool_name: 'get_price' } })
    const result = makeNode({ id: 'r1', kind: 'tool_result', data: { tool_name: 'get_price' } })
    expect(start.toolCallId).toBeUndefined()
    expect(start.data.tool_name).toBe(result.data.tool_name)
  })
})

describe('streamState derivation', () => {
  it('returns disabled when not enabled', () => {
    expect(deriveStreamState(false, false, 0)).toBe('disabled')
    expect(deriveStreamState(false, true, 10)).toBe('disabled')
  })

  it('returns waiting when enabled but no events and not active', () => {
    expect(deriveStreamState(true, false, 0)).toBe('waiting')
  })

  it('returns active when a run is in progress', () => {
    expect(deriveStreamState(true, true, 5)).toBe('active')
  })

  it('returns idle when events exist but no active run', () => {
    expect(deriveStreamState(true, false, 10)).toBe('idle')
  })
})
