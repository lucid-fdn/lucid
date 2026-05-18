/**
 * Cycle Detector — Unit Tests (Phase 4N-a, Task 29)
 */

import { describe, it, expect } from 'vitest'
import { detectCycle } from '../cycle-detector.js'

describe('detectCycle', () => {
  it('accepts a linear chain', () => {
    const result = detectCycle([], [
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'c' },
      { parent: 'c', child: 'd' },
    ])
    expect(result.hasCycle).toBe(false)
  })

  it('accepts a diamond', () => {
    const result = detectCycle([], [
      { parent: 'a', child: 'b' },
      { parent: 'a', child: 'c' },
      { parent: 'b', child: 'd' },
      { parent: 'c', child: 'd' },
    ])
    expect(result.hasCycle).toBe(false)
  })

  it('detects a direct self-loop', () => {
    const result = detectCycle([], [{ parent: 'a', child: 'a' }])
    expect(result.hasCycle).toBe(true)
    expect(result.cycleNodes).toContain('a')
  })

  it('detects a 2-cycle', () => {
    const result = detectCycle([], [
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'a' },
    ])
    expect(result.hasCycle).toBe(true)
    expect(result.cycleNodes).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('detects an indirect 3-cycle', () => {
    const result = detectCycle([], [
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'c' },
      { parent: 'c', child: 'a' },
    ])
    expect(result.hasCycle).toBe(true)
    expect(result.cycleNodes).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('detects a cycle introduced by combining existing + proposed edges', () => {
    const existing = [
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'c' },
    ]
    const proposed = [{ parent: 'c', child: 'a' }]
    const result = detectCycle(existing, proposed)
    expect(result.hasCycle).toBe(true)
  })

  it('accepts a disconnected DAG', () => {
    const result = detectCycle([], [
      { parent: 'a', child: 'b' },
      { parent: 'x', child: 'y' },
      { parent: 'y', child: 'z' },
    ])
    expect(result.hasCycle).toBe(false)
  })

  it('accepts a large random DAG (topologically ordered)', () => {
    // Build 100 nodes in order; each node points to a higher-indexed one
    const edges: { parent: string; child: string }[] = []
    for (let i = 0; i < 100; i++) {
      const children = Math.min(3, 99 - i)
      for (let k = 0; k < children; k++) {
        const target = i + 1 + k
        if (target <= 99) edges.push({ parent: `n${i}`, child: `n${target}` })
      }
    }
    const result = detectCycle([], edges)
    expect(result.hasCycle).toBe(false)
  })

  it('detects a cycle embedded in an otherwise large DAG', () => {
    const edges: { parent: string; child: string }[] = []
    for (let i = 0; i < 50; i++) {
      edges.push({ parent: `n${i}`, child: `n${i + 1}` })
    }
    // Insert back-edge
    edges.push({ parent: 'n30', child: 'n10' })
    const result = detectCycle([], edges)
    expect(result.hasCycle).toBe(true)
  })
})
