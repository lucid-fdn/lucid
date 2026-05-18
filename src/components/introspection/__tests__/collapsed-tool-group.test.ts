import { describe, it, expect } from 'vitest'
import type { StreamNode } from '@/hooks/use-introspection-stream'

/**
 * Tests for the useCollapsedNodes pure logic.
 * Re-implemented here to test without React hooks.
 */

const TOOL_KINDS = new Set(['tool_start', 'tool_result', 'tool_error', 'tool_cache_hit'])

type CollapsedItem = StreamNode | { type: 'group'; toolName: string; nodes: StreamNode[] }

function collapseNodes(nodes: StreamNode[]): CollapsedItem[] {
  const toolNodes = nodes.filter((n) => TOOL_KINDS.has(n.kind))

  if (toolNodes.length <= 20) return nodes

  const result: CollapsedItem[] = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]
    const toolName = String(node.data.tool_name ?? '')

    if (toolName && TOOL_KINDS.has(node.kind)) {
      const group: StreamNode[] = [node]
      let j = i + 1
      while (j < nodes.length) {
        const next = nodes[j]
        const nextToolName = String(next.data.tool_name ?? '')
        if (nextToolName === toolName && TOOL_KINDS.has(next.kind)) {
          group.push(next)
          j++
        } else {
          break
        }
      }

      if (group.length >= 3) {
        result.push({ type: 'group', toolName, nodes: group })
        i = j
        continue
      }
    }

    result.push(node)
    i++
  }

  return result
}

function makeToolNode(toolName: string, index: number, kind: string = 'tool_start'): StreamNode {
  return {
    id: `node-${index}`,
    kind: kind as StreamNode['kind'],
    runId: 'run-1',
    data: { tool_name: toolName },
    createdAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}Z`,
    status: kind === 'tool_error' ? 'error' : 'active',
    seq: index,
  }
}

function makeNonToolNode(index: number): StreamNode {
  return {
    id: `node-${index}`,
    kind: 'llm_start',
    runId: 'run-1',
    data: {},
    createdAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}Z`,
    status: 'active',
    seq: index,
  }
}

describe('collapseNodes (useCollapsedNodes logic)', () => {
  it('does not collapse when run has <=20 tool nodes', () => {
    const nodes = Array.from({ length: 15 }, (_, i) => makeToolNode('get_price', i))
    const result = collapseNodes(nodes)
    // Returns original nodes unchanged
    expect(result).toEqual(nodes)
  })

  it('groups 3+ consecutive same-tool nodes when run has >20 tool nodes', () => {
    // 21 tool nodes: 5 get_price, then 16 others
    const nodes = [
      ...Array.from({ length: 5 }, (_, i) => makeToolNode('get_price', i)),
      ...Array.from({ length: 16 }, (_, i) => makeToolNode('wallet_balance', i + 5)),
    ]
    const result = collapseNodes(nodes)

    // First item should be a group of 5 get_price
    const first = result[0]
    expect('type' in first && first.type === 'group').toBe(true)
    if ('type' in first && first.type === 'group') {
      expect(first.toolName).toBe('get_price')
      expect(first.nodes).toHaveLength(5)
    }

    // Second item should be a group of 16 wallet_balance
    const second = result[1]
    expect('type' in second && second.type === 'group').toBe(true)
    if ('type' in second && second.type === 'group') {
      expect(second.toolName).toBe('wallet_balance')
      expect(second.nodes).toHaveLength(16)
    }
  })

  it('does not group if <3 consecutive same-tool nodes', () => {
    // 21 total tool nodes but alternating
    const nodes: StreamNode[] = []
    for (let i = 0; i < 21; i++) {
      nodes.push(makeToolNode(i % 2 === 0 ? 'a' : 'b', i))
    }
    const result = collapseNodes(nodes)
    // No groups — all alternating, never 3 in a row
    const groups = result.filter((r) => 'type' in r && r.type === 'group')
    expect(groups).toHaveLength(0)
  })

  it('includes tool_error nodes in groups but does not suppress them', () => {
    // 21+ tool nodes with some errors
    const nodes = [
      ...Array.from({ length: 3 }, (_, i) => makeToolNode('get_price', i, 'tool_error')),
      ...Array.from({ length: 18 }, (_, i) => makeToolNode('search_token', i + 3)),
    ]
    const result = collapseNodes(nodes)

    // First group includes tool_error nodes
    const first = result[0]
    expect('type' in first && first.type === 'group').toBe(true)
    if ('type' in first && first.type === 'group') {
      expect(first.toolName).toBe('get_price')
      expect(first.nodes).toHaveLength(3)
      // All error nodes are present in the group
      expect(first.nodes.every((n) => n.status === 'error')).toBe(true)
    }
  })

  it('preserves non-tool nodes between groups', () => {
    const nodes: StreamNode[] = [
      ...Array.from({ length: 10 }, (_, i) => makeToolNode('get_price', i)),
      makeNonToolNode(10),
      ...Array.from({ length: 11 }, (_, i) => makeToolNode('search_token', i + 11)),
    ]
    const result = collapseNodes(nodes)

    // Should be: group(get_price), llm_start, group(search_token)
    expect(result).toHaveLength(3)
    expect('type' in result[0] && result[0].type === 'group').toBe(true)
    expect('kind' in result[1] && result[1].kind === 'llm_start').toBe(true)
    expect('type' in result[2] && result[2].type === 'group').toBe(true)
  })
})
