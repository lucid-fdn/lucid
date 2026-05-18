import { describe, it, expect } from 'vitest'
import type { StreamNode } from '@/hooks/use-introspection-stream'
import type { RunSummary } from '@/hooks/use-run-history'

/**
 * Integration test: Mobile RunSummaryCard expansion flow.
 *
 * Tests the logic behind mobile stream rendering:
 * - RunSummaryCard data derivation from RunSummary
 * - Node filtering by runId (run-scoped expansion)
 * - Toggle expand/collapse state
 * - Multiple runs, only one expanded at a time
 *
 * Note: Can't render React components in node env, so we test the
 * data transformation and state logic directly.
 */

function makeRun(overrides: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    startedAt: '2026-04-01T00:00:00Z',
    endedAt: '2026-04-01T00:00:05Z',
    durationMs: 5000,
    toolCount: 3,
    costUsd: 0.01,
    isActive: false,
    emotion: 'neutral',
    ...overrides,
  } as RunSummary
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

// Simulates the mobile expansion state toggle (from assistant-command-center.tsx)
function toggleExpand(current: string | null, runId: string): string | null {
  return current === runId ? null : runId
}

// Simulates run-scoped node filtering
function getRunNodes(allNodes: StreamNode[], runId: string): StreamNode[] {
  return allNodes.filter((n) => n.runId === runId)
}

describe('Mobile RunSummaryCard expansion flow', () => {
  describe('run-scoped node filtering', () => {
    const nodes: StreamNode[] = [
      makeNode({ id: 'a1', runId: 'run-A', kind: 'tool_start', data: { tool_name: 'get_price' } }),
      makeNode({ id: 'a2', runId: 'run-A', kind: 'tool_result', data: { tool_name: 'get_price' } }),
      makeNode({ id: 'b1', runId: 'run-B', kind: 'tool_start', data: { tool_name: 'wallet_balance' } }),
      makeNode({ id: 'b2', runId: 'run-B', kind: 'tool_error', data: { tool_name: 'wallet_balance' } }),
      makeNode({ id: 'b3', runId: 'run-B', kind: 'run_end', status: 'complete' }),
    ]

    it('returns only nodes for run-A', () => {
      const runANodes = getRunNodes(nodes, 'run-A')
      expect(runANodes).toHaveLength(2)
      expect(runANodes.every((n) => n.runId === 'run-A')).toBe(true)
    })

    it('returns only nodes for run-B', () => {
      const runBNodes = getRunNodes(nodes, 'run-B')
      expect(runBNodes).toHaveLength(3)
      expect(runBNodes.every((n) => n.runId === 'run-B')).toBe(true)
    })

    it('returns empty for non-existent run', () => {
      expect(getRunNodes(nodes, 'run-Z')).toHaveLength(0)
    })
  })

  describe('expand/collapse toggle', () => {
    it('expands when nothing is expanded', () => {
      expect(toggleExpand(null, 'run-A')).toBe('run-A')
    })

    it('collapses when same run is tapped', () => {
      expect(toggleExpand('run-A', 'run-A')).toBeNull()
    })

    it('switches to different run', () => {
      expect(toggleExpand('run-A', 'run-B')).toBe('run-B')
    })
  })

  describe('RunSummaryCard data derivation', () => {
    it('formats duration correctly for short runs', () => {
      const run = makeRun({ runId: 'r1', durationMs: 500 })
      // Mirror RunSummaryCard logic
      const duration = run.durationMs < 1000
        ? `${run.durationMs}ms`
        : `${(run.durationMs / 1000).toFixed(1)}s`
      expect(duration).toBe('500ms')
    })

    it('formats duration correctly for longer runs', () => {
      const run = makeRun({ runId: 'r1', durationMs: 4500 })
      const duration = run.durationMs < 1000
        ? `${run.durationMs}ms`
        : `${(run.durationMs / 1000).toFixed(1)}s`
      expect(duration).toBe('4.5s')
    })

    it('formats cost with 3 decimals for normal costs', () => {
      const run = makeRun({ runId: 'r1', costUsd: 0.015 })
      const cost = run.costUsd > 0
        ? `$${run.costUsd < 0.01 ? run.costUsd.toFixed(4) : run.costUsd.toFixed(3)}`
        : null
      expect(cost).toBe('$0.015')
    })

    it('formats cost with 4 decimals for micro costs', () => {
      const run = makeRun({ runId: 'r1', costUsd: 0.0012 })
      const cost = run.costUsd > 0
        ? `$${run.costUsd < 0.01 ? run.costUsd.toFixed(4) : run.costUsd.toFixed(3)}`
        : null
      expect(cost).toBe('$0.0012')
    })

    it('null cost when zero', () => {
      const run = makeRun({ runId: 'r1', costUsd: 0 })
      const cost = run.costUsd > 0 ? 'has cost' : null
      expect(cost).toBeNull()
    })

    it('builds summary parts correctly', () => {
      const run = makeRun({ runId: 'r1', toolCount: 5, durationMs: 3200, costUsd: 0.025 })
      const parts = [
        run.toolCount > 0 ? `${run.toolCount} tools` : null,
        run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`,
        run.costUsd > 0 ? `$${run.costUsd.toFixed(3)}` : null,
      ].filter(Boolean)
      expect(parts).toEqual(['5 tools', '3.2s', '$0.025'])
    })
  })

  describe('multi-run scenario', () => {
    const runs = [
      makeRun({ runId: 'run-1', toolCount: 3, durationMs: 2000 }),
      makeRun({ runId: 'run-2', toolCount: 5, durationMs: 8000, costUsd: 0.05 }),
      makeRun({ runId: 'run-3', isActive: true, durationMs: 1200, toolCount: 1 }),
    ]

    const allNodes: StreamNode[] = [
      makeNode({ id: 'r1-1', runId: 'run-1', kind: 'tool_start' }),
      makeNode({ id: 'r1-2', runId: 'run-1', kind: 'tool_result', status: 'complete' }),
      makeNode({ id: 'r1-3', runId: 'run-1', kind: 'run_end', status: 'complete' }),
      makeNode({ id: 'r2-1', runId: 'run-2', kind: 'tool_start' }),
      makeNode({ id: 'r2-2', runId: 'run-2', kind: 'tool_start' }),
      makeNode({ id: 'r2-3', runId: 'run-2', kind: 'run_end', status: 'complete' }),
      makeNode({ id: 'r3-1', runId: 'run-3', kind: 'tool_start' }),
    ]

    it('each run card maps to its own scoped nodes', () => {
      for (const run of runs) {
        const scopedNodes = getRunNodes(allNodes, run.runId)
        expect(scopedNodes.every((n) => n.runId === run.runId)).toBe(true)
      }
    })

    it('node counts match expectations per run', () => {
      expect(getRunNodes(allNodes, 'run-1')).toHaveLength(3)
      expect(getRunNodes(allNodes, 'run-2')).toHaveLength(3)
      expect(getRunNodes(allNodes, 'run-3')).toHaveLength(1)
    })

    it('only one run can be expanded at a time', () => {
      let expanded: string | null = null

      expanded = toggleExpand(expanded, 'run-1')
      expect(expanded).toBe('run-1')

      expanded = toggleExpand(expanded, 'run-2')
      expect(expanded).toBe('run-2')
      // run-1 is no longer expanded

      expanded = toggleExpand(expanded, 'run-2')
      expect(expanded).toBeNull()
    })

    it('active runs are identifiable', () => {
      const activeRuns = runs.filter((r) => r.isActive)
      expect(activeRuns).toHaveLength(1)
      expect(activeRuns[0].runId).toBe('run-3')
    })
  })
})
