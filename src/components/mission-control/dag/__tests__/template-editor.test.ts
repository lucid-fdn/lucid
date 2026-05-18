import { describe, expect, it } from 'vitest'
import { validateSpecText } from '../template-editor'
import { dagSpecSchema, type DagSpec } from '@contracts/dag'

describe('template-editor validateSpecText', () => {
  it('accepts a minimal valid DagSpec', () => {
    const spec: DagSpec = {
      nodes: [{ node_key: 'root', node_type: 'leaf', step_type: 'inbound' }],
      edges: [],
    }
    const result = validateSpecText(JSON.stringify(spec))
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.parsed).toBeDefined()
    expect(result.parsed?.nodes).toHaveLength(1)
  })

  it('accepts a multi-node DagSpec with edges', () => {
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf', step_type: 'inbound' },
        { node_key: 'b', node_type: 'approval' },
        { node_key: 'c', node_type: 'leaf', step_type: 'outbound' },
      ],
      edges: [
        { parent: 'a', child: 'b', edge_kind: 'order' },
        { parent: 'b', child: 'c', edge_kind: 'order' },
      ],
    }
    const result = validateSpecText(JSON.stringify(spec, null, 2))
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns a JSON error for unparseable text', () => {
    const result = validateSpecText('{not json')
    expect(result.ok).toBe(false)
    expect(result.parsed).toBeUndefined()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].path).toBe('(json)')
  })

  it('returns Zod errors for structurally invalid specs', () => {
    const invalid = {
      nodes: [{ node_key: 'root', node_type: 'bogus_kind' }],
      edges: [],
    }
    const result = validateSpecText(JSON.stringify(invalid))
    expect(result.ok).toBe(false)
    expect(result.parsed).toBeUndefined()
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.path.includes('node_type'))).toBe(true)
  })

  it('rejects missing required root fields', () => {
    const result = validateSpecText(JSON.stringify({ nodes: [] }))
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects non-object root', () => {
    const result = validateSpecText(JSON.stringify([]))
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('reference seed templates (Task 64)', () => {
  // Mirror the specs in supabase/migrations/20260407300000_dag_template_seeds.sql
  // to guarantee the seeded JSONB payloads parse cleanly against dagSpecSchema.
  const complaintHandler: DagSpec = {
    nodes: [
      { node_key: 'intake', node_type: 'leaf', step_type: 'inbound', route_class: 'fast' },
      { node_key: 'classify', node_type: 'leaf', step_type: 'scheduled', route_class: 'fast' },
      { node_key: 'analyze', node_type: 'leaf', step_type: 'scheduled', route_class: 'strong' },
      { node_key: 'refund_ok', node_type: 'approval', step_type: 'approval' },
      { node_key: 'respond', node_type: 'leaf', step_type: 'outbound', route_class: 'fast' },
    ],
    edges: [
      { parent: 'intake', child: 'classify', edge_kind: 'order' },
      { parent: 'classify', child: 'analyze', edge_kind: 'order' },
      { parent: 'analyze', child: 'refund_ok', edge_kind: 'order' },
      { parent: 'refund_ok', child: 'respond', edge_kind: 'order' },
    ],
    metadata: { archetype: 'support', author: 'lucid' },
  }

  const orderFulfillment: DagSpec = {
    nodes: [
      { node_key: 'parse_order', node_type: 'leaf', step_type: 'inbound', route_class: 'fast' },
      { node_key: 'fulfill_items', node_type: 'expansion_zone' },
      { node_key: 'all_ready', node_type: 'barrier' },
      { node_key: 'confirm', node_type: 'leaf', step_type: 'outbound', route_class: 'fast' },
    ],
    edges: [
      { parent: 'parse_order', child: 'fulfill_items', edge_kind: 'order' },
      { parent: 'fulfill_items', child: 'all_ready', edge_kind: 'barrier' },
      { parent: 'all_ready', child: 'confirm', edge_kind: 'order' },
    ],
    expansion_zones: ['fulfill_items'],
    metadata: { archetype: 'commerce', author: 'lucid' },
  }

  const contentPipeline: DagSpec = {
    nodes: [
      { node_key: 'brief', node_type: 'leaf', step_type: 'inbound', route_class: 'fast' },
      { node_key: 'research', node_type: 'leaf', step_type: 'scheduled', route_class: 'strong' },
      { node_key: 'draft', node_type: 'leaf', step_type: 'scheduled', route_class: 'strong' },
      { node_key: 'review', node_type: 'approval', step_type: 'approval' },
      { node_key: 'publish', node_type: 'leaf', step_type: 'outbound', route_class: 'fast' },
    ],
    edges: [
      { parent: 'brief', child: 'research', edge_kind: 'order' },
      { parent: 'research', child: 'draft', edge_kind: 'data' },
      { parent: 'draft', child: 'review', edge_kind: 'order' },
      { parent: 'review', child: 'publish', edge_kind: 'order' },
    ],
    metadata: { archetype: 'content', author: 'lucid' },
  }

  it('complaint_handler matches dagSpecSchema', () => {
    expect(dagSpecSchema.safeParse(complaintHandler).success).toBe(true)
  })

  it('order_fulfillment matches dagSpecSchema and declares an expansion_zone', () => {
    const result = dagSpecSchema.safeParse(orderFulfillment)
    expect(result.success).toBe(true)
    expect(orderFulfillment.expansion_zones).toContain('fulfill_items')
  })

  it('content_pipeline matches dagSpecSchema and has an approval node', () => {
    const result = dagSpecSchema.safeParse(contentPipeline)
    expect(result.success).toBe(true)
    expect(contentPipeline.nodes.some((n) => n.node_type === 'approval')).toBe(true)
  })
})
