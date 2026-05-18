/**
 * DagPlanner — Unit Tests (Phase 4N-a, Task 24)
 *
 * Covers:
 *   - Linear template: 1 root (count=0), 2 children (count=1 each)
 *   - Diamond template: 1 root (count=0), 2 mid (count=1), 1 join (count=2)
 *   - Disconnected components: all roots with count=0
 *   - Cycle input → DagCycleError, no DB writes
 */

import { describe, it, expect, vi } from 'vitest'
import {
  DagPlanner,
  DagCycleError,
  DagSizeError,
  MAX_DAG_NODES,
  MAX_DAG_EDGES,
} from '../planner.js'
import type { DagSpec } from '../types.js'

interface CapturedInsert {
  table: string
  rows: Record<string, unknown>[]
}

function mockSupabase() {
  const inserts: CapturedInsert[] = []
  const deletes: string[] = []

  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
      return { error: null }
    }),
    delete: vi.fn(() => ({
      eq: vi.fn(async () => {
        deletes.push(table)
        return { error: null }
      }),
    })),
  }))

  return { supabase: { from } as any, inserts, deletes }
}

let nextId = 0
const stableUuid = () => `uuid-${nextId++}`

function freshPlanner() {
  nextId = 0
  const mock = mockSupabase()
  return { ...mock, planner: new DagPlanner(mock.supabase, stableUuid) }
}

const BASE_INPUT = {
  agentId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  source: 'template' as const,
}

describe('DagPlanner.instantiateFromTemplate', () => {
  it('linear: 1 root with count=0, 2 children with count=1', async () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf' },
        { node_key: 'b', node_type: 'leaf' },
        { node_key: 'c', node_type: 'leaf' },
      ],
      edges: [
        { parent: 'a', child: 'b' },
        { parent: 'b', child: 'c' },
      ],
    }
    const { planner, inserts } = freshPlanner()
    const result = await planner.instantiateFromTemplate({ ...BASE_INPUT, spec })

    expect(result.totalNodes).toBe(3)
    expect(result.readyNodes).toBe(1)
    expect(result.rootNodeIds).toHaveLength(1)

    const nodeInsert = inserts.find((i) => i.table === 'orchestration_dag_nodes')!
    const counts = new Map(
      nodeInsert.rows.map((r) => [r.node_key as string, r.pending_parent_count as number]),
    )
    expect(counts.get('a')).toBe(0)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('c')).toBe(1)
  })

  it('diamond: root=0, mids=1, join=2', async () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'root', node_type: 'leaf' },
        { node_key: 'mid1', node_type: 'leaf' },
        { node_key: 'mid2', node_type: 'leaf' },
        { node_key: 'join', node_type: 'leaf' },
      ],
      edges: [
        { parent: 'root', child: 'mid1' },
        { parent: 'root', child: 'mid2' },
        { parent: 'mid1', child: 'join' },
        { parent: 'mid2', child: 'join' },
      ],
    }
    const { planner, inserts } = freshPlanner()
    const result = await planner.instantiateFromTemplate({ ...BASE_INPUT, spec })

    expect(result.readyNodes).toBe(1)
    const nodeInsert = inserts.find((i) => i.table === 'orchestration_dag_nodes')!
    const counts = new Map(
      nodeInsert.rows.map((r) => [r.node_key as string, r.pending_parent_count as number]),
    )
    expect(counts.get('root')).toBe(0)
    expect(counts.get('mid1')).toBe(1)
    expect(counts.get('mid2')).toBe(1)
    expect(counts.get('join')).toBe(2)
  })

  it('disconnected components: all roots with count=0', async () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf' },
        { node_key: 'b', node_type: 'leaf' },
        { node_key: 'x', node_type: 'leaf' },
        { node_key: 'y', node_type: 'leaf' },
      ],
      edges: [
        { parent: 'a', child: 'b' },
        { parent: 'x', child: 'y' },
      ],
    }
    const { planner } = freshPlanner()
    const result = await planner.instantiateFromTemplate({ ...BASE_INPUT, spec })

    expect(result.readyNodes).toBe(2)
    expect(result.rootNodeIds).toHaveLength(2)
  })

  it('inserts rows into exactly 3 tables with a single edge round-trip', async () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf' },
        { node_key: 'b', node_type: 'leaf' },
      ],
      edges: [{ parent: 'a', child: 'b' }],
    }
    const { planner, inserts } = freshPlanner()
    await planner.instantiateFromTemplate({ ...BASE_INPUT, spec })

    const tables = inserts.map((i) => i.table)
    expect(tables).toEqual([
      'orchestration_dags',
      'orchestration_dag_nodes',
      'orchestration_dag_edges',
    ])
  })

  it('throws DagSizeError when node count exceeds MAX_DAG_NODES and does not write to DB', async () => {
    const nodes = Array.from({ length: MAX_DAG_NODES + 1 }, (_, i) => ({
      node_key: `n${i}`,
      node_type: 'leaf' as const,
    }))
    const spec: DagSpec = { nodes, edges: [] }
    const { planner, inserts } = freshPlanner()
    const err = await planner
      .instantiateFromTemplate({ ...BASE_INPUT, spec })
      .catch((e) => e)
    expect(err).toBeInstanceOf(DagSizeError)
    expect((err as DagSizeError).kind).toBe('nodes')
    expect((err as DagSizeError).count).toBe(MAX_DAG_NODES + 1)
    expect((err as DagSizeError).limit).toBe(MAX_DAG_NODES)
    expect(inserts).toHaveLength(0)
  })

  it('throws DagSizeError when edge count exceeds MAX_DAG_EDGES and does not write to DB', async () => {
    // Need enough nodes to carry the edges — stay under the node cap by
    // fanning many edges out of a small set of roots.
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      node_key: `n${i}`,
      node_type: 'leaf' as const,
    }))
    const edges = Array.from({ length: MAX_DAG_EDGES + 1 }, (_, i) => ({
      parent: `n${i % 10}`,
      child: `n${10 + (i % 10)}`,
    }))
    const spec: DagSpec = { nodes, edges }
    const { planner, inserts } = freshPlanner()
    const err = await planner
      .instantiateFromTemplate({ ...BASE_INPUT, spec })
      .catch((e) => e)
    expect(err).toBeInstanceOf(DagSizeError)
    expect((err as DagSizeError).kind).toBe('edges')
    expect((err as DagSizeError).count).toBe(MAX_DAG_EDGES + 1)
    expect(inserts).toHaveLength(0)
  })

  it('throws DagCycleError on a cyclic spec and does not write to DB', async () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf' },
        { node_key: 'b', node_type: 'leaf' },
      ],
      edges: [
        { parent: 'a', child: 'b' },
        { parent: 'b', child: 'a' },
      ],
    }
    const { planner, inserts } = freshPlanner()
    await expect(
      planner.instantiateFromTemplate({ ...BASE_INPUT, spec }),
    ).rejects.toBeInstanceOf(DagCycleError)
    expect(inserts).toHaveLength(0)
  })
})
