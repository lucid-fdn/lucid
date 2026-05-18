import { describe, it, expect } from 'vitest'
import { computeAnnotations, fingerprint } from '@/hooks/use-smart-annotations'
import type { Annotation } from '@/hooks/use-smart-annotations'
import type { StreamNode } from '@/hooks/use-introspection-stream'
import type { RunSummary } from '@/hooks/use-run-history'

/**
 * Tests for smart annotation logic — imports real functions from source.
 * Covers computeAnnotations, fingerprint dedup, and seenRef behavior simulation.
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
    runId: 'run-3',
    data: {},
    createdAt: '2026-04-01T00:00:00Z',
    status: 'active',
    seq: 0,
    ...overrides,
  }
}

describe('computeAnnotations', () => {
  it('returns empty for no runs', () => {
    expect(computeAnnotations([], [])).toEqual([])
  })

  it('returns empty for only active runs', () => {
    const runs = [makeRun({ runId: 'run-1', isActive: true })]
    expect(computeAnnotations(runs, [])).toEqual([])
  })

  it('detects cost spike (>3x average)', () => {
    const runs = [
      makeRun({ runId: 'run-1', costUsd: 0.01 }),
      makeRun({ runId: 'run-2', costUsd: 0.01 }),
      makeRun({ runId: 'run-3', costUsd: 0.10 }),
    ]
    const annotations = computeAnnotations(runs, [])
    expect(annotations.some((a) => a.id.startsWith('cost-'))).toBe(true)
    expect(annotations.find((a) => a.id.startsWith('cost-'))!.severity).toBe('warn')
  })

  it('does not flag cost when below 3x threshold', () => {
    const runs = [
      makeRun({ runId: 'run-1', costUsd: 0.01 }),
      makeRun({ runId: 'run-2', costUsd: 0.01 }),
      makeRun({ runId: 'run-3', costUsd: 0.025 }), // 2.5x — below threshold
    ]
    const annotations = computeAnnotations(runs, [])
    expect(annotations.some((a) => a.id.startsWith('cost-'))).toBe(false)
  })

  it('detects tool failure spike (>=2 errors for same tool)', () => {
    const runs = [makeRun({ runId: 'run-1' })]
    const nodes = [
      makeNode({ id: 'e1', kind: 'tool_error', runId: 'run-1', data: { tool_name: 'get_price' } }),
      makeNode({ id: 'e2', kind: 'tool_error', runId: 'run-1', data: { tool_name: 'get_price' } }),
    ]
    const annotations = computeAnnotations(runs, nodes)
    expect(annotations.some((a) => a.id.startsWith('errors-'))).toBe(true)
  })

  it('detects duration spike (>3x average)', () => {
    const runs = [
      makeRun({ runId: 'run-1', durationMs: 1000 }),
      makeRun({ runId: 'run-2', durationMs: 1000 }),
      makeRun({ runId: 'run-3', durationMs: 10000 }), // 10x
    ]
    const annotations = computeAnnotations(runs, [])
    expect(annotations.some((a) => a.id.startsWith('slow-'))).toBe(true)
    expect(annotations.find((a) => a.id.startsWith('slow-'))!.severity).toBe('info')
  })

  it('detects repeated tool calls (>5x same tool in one run)', () => {
    const runs = [makeRun({ runId: 'run-1' })]
    const nodes = Array.from({ length: 7 }, (_, i) =>
      makeNode({ id: `t-${i}`, kind: 'tool_start', runId: 'run-1', data: { tool_name: 'get_price' } }),
    )
    const annotations = computeAnnotations(runs, nodes)
    expect(annotations.some((a) => a.id.startsWith('repeat-'))).toBe(true)
  })

  it('limits to max 2 annotations per run', () => {
    const runs = [
      makeRun({ runId: 'run-1', costUsd: 0.01, durationMs: 1000 }),
      makeRun({ runId: 'run-2', costUsd: 0.01, durationMs: 1000 }),
      makeRun({ runId: 'run-3', costUsd: 0.50, durationMs: 30000 }),
    ]
    const nodes = [
      makeNode({ id: 'e1', kind: 'tool_error', runId: 'run-3', data: { tool_name: 'api' } }),
      makeNode({ id: 'e2', kind: 'tool_error', runId: 'run-3', data: { tool_name: 'api' } }),
    ]
    const annotations = computeAnnotations(runs, nodes)
    expect(annotations.length).toBeLessThanOrEqual(2)
  })

  it('sorts warn before info', () => {
    const runs = [
      makeRun({ runId: 'run-1', costUsd: 0.01, durationMs: 1000 }),
      makeRun({ runId: 'run-2', costUsd: 0.01, durationMs: 1000 }),
      makeRun({ runId: 'run-3', costUsd: 0.50, durationMs: 10000 }),
    ]
    const annotations = computeAnnotations(runs, [])
    if (annotations.length >= 2) {
      expect(annotations[0].severity).toBe('warn')
    }
  })
})

describe('fingerprint', () => {
  it('same type annotations from different runs share fingerprint', () => {
    const ann1: Annotation = { id: 'cost-abc123', runId: 'abc123', severity: 'warn', message: 'test' }
    const ann2: Annotation = { id: 'cost-def456', runId: 'def456', severity: 'warn', message: 'test' }
    expect(fingerprint(ann1)).toBe(fingerprint(ann2))
  })

  it('different types produce different fingerprints', () => {
    const costAnn: Annotation = { id: 'cost-abc123', runId: 'abc123', severity: 'warn', message: 'test' }
    const slowAnn: Annotation = { id: 'slow-abc123', runId: 'abc123', severity: 'info', message: 'test' }
    expect(fingerprint(costAnn)).not.toBe(fingerprint(slowAnn))
  })

  it('different tools produce different fingerprints', () => {
    const ann1: Annotation = { id: 'errors-run1-get_price', runId: 'run1', severity: 'warn', message: 'test' }
    const ann2: Annotation = { id: 'errors-run1-search_token', runId: 'run1', severity: 'warn', message: 'test' }
    expect(fingerprint(ann1)).not.toBe(fingerprint(ann2))
  })

  it('includes severity in fingerprint', () => {
    const warn: Annotation = { id: 'cost-abc', runId: 'abc', severity: 'warn', message: 'test' }
    const info: Annotation = { id: 'cost-abc', runId: 'abc', severity: 'info', message: 'test' }
    expect(fingerprint(warn)).not.toBe(fingerprint(info))
  })
})

describe('seenRef dedup simulation', () => {
  // Simulates the hook's seenRef behavior without React hooks
  it('suppresses annotations seen within last 3 runs', () => {
    const seen = new Map<string, number>()

    function dedup(annotations: Annotation[], runCount: number): Annotation[] {
      return annotations.filter((ann) => {
        const fp = fingerprint(ann)
        const lastSeen = seen.get(fp)
        if (lastSeen != null && runCount - lastSeen < 3) return false
        seen.set(fp, runCount)
        return true
      })
    }

    const ann = { id: 'cost-r1', runId: 'r1', severity: 'warn' as const, message: 'spike' }

    // Run 1: first time — should show
    expect(dedup([ann], 1)).toHaveLength(1)

    // Run 2: within window of 3 — should suppress
    const ann2 = { ...ann, id: 'cost-r2', runId: 'r2' }
    expect(dedup([ann2], 2)).toHaveLength(0)

    // Run 4: outside window (4 - 1 = 3, not < 3) — should show again
    const ann4 = { ...ann, id: 'cost-r4', runId: 'r4' }
    expect(dedup([ann4], 4)).toHaveLength(1)
  })

  it('does not suppress different annotation types', () => {
    const seen = new Map<string, number>()

    function dedup(annotations: Annotation[], runCount: number): Annotation[] {
      return annotations.filter((ann) => {
        const fp = fingerprint(ann)
        const lastSeen = seen.get(fp)
        if (lastSeen != null && runCount - lastSeen < 3) return false
        seen.set(fp, runCount)
        return true
      })
    }

    const costAnn = { id: 'cost-r1', runId: 'r1', severity: 'warn' as const, message: 'cost' }
    const slowAnn = { id: 'slow-r1', runId: 'r1', severity: 'info' as const, message: 'slow' }

    // Both should show — different fingerprints
    expect(dedup([costAnn, slowAnn], 1)).toHaveLength(2)
  })
})
