import { describe, it, expect } from 'vitest'
import { sortBySeq } from '@/hooks/use-introspection-stream'
import type { StreamNode, StreamState } from '@/hooks/use-introspection-stream'

/**
 * Integration test: Full stream state machine transitions.
 *
 * Simulates the hook's derived state logic with sequences of incoming nodes
 * and verifies correct state transitions: disabled → waiting → active → idle.
 */

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

// Mirror the hook's streamState derivation
function deriveStreamState(
  enabled: boolean,
  nodes: StreamNode[],
): { streamState: StreamState; isActive: boolean } {
  const isActive = nodes.length > 0 && nodes[nodes.length - 1].kind !== 'run_end'
  let streamState: StreamState
  if (!enabled) streamState = 'disabled'
  else if (isActive) streamState = 'active'
  else if (nodes.length > 0) streamState = 'idle'
  else streamState = 'waiting'
  return { streamState, isActive }
}

// Simulate ring buffer behavior from the hook
function addNodes(existing: StreamNode[], incoming: StreamNode[]): StreamNode[] {
  return [...existing, ...incoming].sort(sortBySeq).slice(-200)
}

describe('Stream state machine integration', () => {
  it('starts in disabled when not enabled', () => {
    const { streamState } = deriveStreamState(false, [])
    expect(streamState).toBe('disabled')
  })

  it('starts in waiting when enabled with no nodes', () => {
    const { streamState } = deriveStreamState(true, [])
    expect(streamState).toBe('waiting')
  })

  it('transitions waiting → active on first tool_start', () => {
    let nodes: StreamNode[] = []
    expect(deriveStreamState(true, nodes).streamState).toBe('waiting')

    nodes = addNodes(nodes, [
      makeNode({ id: 'n1', kind: 'run_start', seq: 1, createdAt: '2026-04-01T00:00:01Z' }),
    ])
    expect(deriveStreamState(true, nodes).streamState).toBe('active')
  })

  it('transitions active → idle on run_end', () => {
    let nodes: StreamNode[] = []

    // Start run
    nodes = addNodes(nodes, [
      makeNode({ id: 'n1', kind: 'run_start', seq: 1, createdAt: '2026-04-01T00:00:01Z' }),
      makeNode({ id: 'n2', kind: 'tool_start', seq: 2, createdAt: '2026-04-01T00:00:02Z' }),
      makeNode({ id: 'n3', kind: 'tool_result', seq: 3, createdAt: '2026-04-01T00:00:03Z', status: 'complete' }),
    ])
    expect(deriveStreamState(true, nodes).streamState).toBe('active')

    // End run
    nodes = addNodes(nodes, [
      makeNode({ id: 'n4', kind: 'run_end', seq: 4, createdAt: '2026-04-01T00:00:04Z', status: 'complete' }),
    ])
    expect(deriveStreamState(true, nodes).streamState).toBe('idle')
  })

  it('transitions idle → active on new run', () => {
    let nodes: StreamNode[] = []

    // Complete first run
    nodes = addNodes(nodes, [
      makeNode({ id: 'n1', kind: 'run_start', runId: 'run-1', seq: 1, createdAt: '2026-04-01T00:00:01Z' }),
      makeNode({ id: 'n2', kind: 'run_end', runId: 'run-1', seq: 2, createdAt: '2026-04-01T00:00:02Z', status: 'complete' }),
    ])
    expect(deriveStreamState(true, nodes).streamState).toBe('idle')

    // Start second run
    nodes = addNodes(nodes, [
      makeNode({ id: 'n3', kind: 'run_start', runId: 'run-2', seq: 1, createdAt: '2026-04-01T00:05:01Z' }),
    ])
    expect(deriveStreamState(true, nodes).streamState).toBe('active')
  })

  it('stays disabled regardless of nodes when not enabled', () => {
    const nodes = addNodes([], [
      makeNode({ id: 'n1', kind: 'tool_start', seq: 1 }),
    ])
    expect(deriveStreamState(false, nodes).streamState).toBe('disabled')
  })

  it('activeRunId comes from last node when active', () => {
    const nodes = addNodes([], [
      makeNode({ id: 'n1', kind: 'run_start', runId: 'run-abc', seq: 1, createdAt: '2026-04-01T00:00:01Z' }),
      makeNode({ id: 'n2', kind: 'tool_start', runId: 'run-abc', seq: 2, createdAt: '2026-04-01T00:00:02Z' }),
    ])
    const { isActive } = deriveStreamState(true, nodes)
    expect(isActive).toBe(true)
    expect(nodes[nodes.length - 1].runId).toBe('run-abc')
  })

  it('ring buffer preserves most recent 200 nodes', () => {
    const old = Array.from({ length: 210 }, (_, i) =>
      makeNode({
        id: `old-${i}`,
        seq: i,
        createdAt: `2026-04-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
      }),
    )
    const trimmed = addNodes([], old)
    expect(trimmed).toHaveLength(200)
    expect(trimmed[0].id).toBe('old-10')
    expect(trimmed[199].id).toBe('old-209')
  })

  it('handles interleaved multi-run nodes correctly', () => {
    // Two runs with timestamps close together but different runIds
    const nodes = addNodes([], [
      makeNode({ id: 'a1', runId: 'run-A', kind: 'run_start', seq: 1, createdAt: '2026-04-01T00:00:00Z' }),
      makeNode({ id: 'a2', runId: 'run-A', kind: 'run_end', seq: 2, createdAt: '2026-04-01T00:00:01Z', status: 'complete' }),
      makeNode({ id: 'b1', runId: 'run-B', kind: 'run_start', seq: 1, createdAt: '2026-04-01T00:05:00Z' }),
      makeNode({ id: 'b2', runId: 'run-B', kind: 'tool_start', seq: 2, createdAt: '2026-04-01T00:05:01Z' }),
    ])
    // Last node is tool_start from run-B → active
    const { streamState, isActive } = deriveStreamState(true, nodes)
    expect(streamState).toBe('active')
    expect(isActive).toBe(true)
  })

  it('correctly identifies error status nodes', () => {
    const nodes = addNodes([], [
      makeNode({ id: 'n1', kind: 'tool_start', seq: 1, createdAt: '2026-04-01T00:00:01Z' }),
      makeNode({ id: 'n2', kind: 'tool_error', seq: 2, createdAt: '2026-04-01T00:00:02Z', status: 'error' }),
    ])
    // tool_error is not run_end, so still active
    expect(deriveStreamState(true, nodes).isActive).toBe(true)
    expect(nodes[1].status).toBe('error')
  })
})
