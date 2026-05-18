import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from 'reactflow'

// ---------------------------------------------------------------------------
// Mock elkjs -- the source module caches the ELK instance after first call
// to getELK(), so we need a stable mock object that survives across tests.
// ---------------------------------------------------------------------------
const mockLayout = vi.fn()

// The ELK mock constructor always returns the same object with our mock layout fn
vi.mock('elkjs/lib/elk.bundled.js', () => {
  return {
    default: class MockELK {
      layout = mockLayout
    },
  }
})

import { autoLayoutNodes, getNodesBounds } from '../auto-layout'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(
  id: string,
  x = 0,
  y = 0,
  width?: number,
  height?: number,
): Node {
  const node: Record<string, unknown> = {
    id,
    type: 'default',
    position: { x, y },
    data: { label: id },
  }
  if (width !== undefined) node.width = width
  if (height !== undefined) node.height = height
  return node as Node
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target } as Edge
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('auto-layout module', () => {
  beforeEach(() => {
    mockLayout.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // -----------------------------------------------------------------------
  // autoLayoutNodes
  // -----------------------------------------------------------------------
  describe('autoLayoutNodes', () => {
    it('returns original nodes when array is empty', async () => {
      const result = await autoLayoutNodes([], [])
      expect(result).toEqual([])
      // ELK should not even be called
      expect(mockLayout).not.toHaveBeenCalled()
    })

    it('returns original nodes when all nodes are empty-state', async () => {
      const nodes = [makeNode('empty-state', 100, 100)]
      const result = await autoLayoutNodes(nodes, [])
      expect(result).toEqual(nodes)
      expect(mockLayout).not.toHaveBeenCalled()
    })

    it('filters out empty-state nodes before layout', async () => {
      const realNode = makeNode('node-1', 0, 0)
      const emptyState = makeNode('empty-state', 50, 50)

      mockLayout.mockResolvedValue({
        children: [{ id: 'node-1', x: 10, y: 20 }],
      })

      const result = await autoLayoutNodes(
        [realNode, emptyState],
        [],
      )

      // Result should only contain the real node, not empty-state
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('node-1')
      expect(result[0].position).toEqual({ x: 10, y: 20 })
    })

    it('handles a single node', async () => {
      const node = makeNode('solo', 5, 10)

      mockLayout.mockResolvedValue({
        children: [{ id: 'solo', x: 0, y: 0 }],
      })

      const result = await autoLayoutNodes([node], [])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('solo')
      expect(result[0].position).toEqual({ x: 0, y: 0 })
    })

    it('skips edges with missing source node references', async () => {
      const nodes = [makeNode('a'), makeNode('b')]
      const edges = [
        makeEdge('e1', 'a', 'b'),
        makeEdge('e2', 'missing-source', 'b'), // source does not exist
      ]

      mockLayout.mockResolvedValue({
        children: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 100, y: 0 },
        ],
      })

      await autoLayoutNodes(nodes, edges)

      // Verify the graph passed to ELK only has the valid edge
      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.edges).toHaveLength(1)
      expect(graphArg.edges[0].id).toBe('e1')
    })

    it('skips edges with missing target node references', async () => {
      const nodes = [makeNode('a'), makeNode('b')]
      const edges = [
        makeEdge('e1', 'a', 'b'),
        makeEdge('e2', 'a', 'missing-target'), // target does not exist
      ]

      mockLayout.mockResolvedValue({
        children: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 100, y: 0 },
        ],
      })

      await autoLayoutNodes(nodes, edges)

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.edges).toHaveLength(1)
      expect(graphArg.edges[0].id).toBe('e1')
    })

    it('skips edges referencing empty-state node (filtered out)', async () => {
      const nodes = [makeNode('a'), makeNode('empty-state')]
      const edges = [makeEdge('e1', 'a', 'empty-state')]

      mockLayout.mockResolvedValue({
        children: [{ id: 'a', x: 0, y: 0 }],
      })

      await autoLayoutNodes(nodes, edges)

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.edges).toHaveLength(0)
    })

    it('applies positions from ELK layout result', async () => {
      const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 0)]
      const edges = [makeEdge('e1', 'a', 'b')]

      mockLayout.mockResolvedValue({
        children: [
          { id: 'a', x: 50, y: 100 },
          { id: 'b', x: 300, y: 100 },
        ],
      })

      const result = await autoLayoutNodes(nodes, edges)

      expect(result[0].position).toEqual({ x: 50, y: 100 })
      expect(result[1].position).toEqual({ x: 300, y: 100 })
    })

    it('preserves original position if ELK node has no x/y', async () => {
      const nodes = [makeNode('a', 42, 99)]

      mockLayout.mockResolvedValue({
        children: [{ id: 'a' }], // no x, no y
      })

      const result = await autoLayoutNodes(nodes, [])

      // Falls back to original position because elkNode.x/y are undefined
      // The ?? operator means undefined falls through to node.position.x/y
      expect(result[0].position).toEqual({ x: 42, y: 99 })
    })

    it('returns original nodes when ELK throws an error', async () => {
      const nodes = [makeNode('a', 10, 20)]

      mockLayout.mockRejectedValue(new Error('ELK crashed'))

      const result = await autoLayoutNodes(nodes, [])

      // Should return realNodes (original, minus empty-state)
      expect(result).toHaveLength(1)
      expect(result[0].position).toEqual({ x: 10, y: 20 })
    })

    it('uses default dimensions (260x160) when node has no measured or explicit size', async () => {
      const node = makeNode('a')

      mockLayout.mockResolvedValue({
        children: [{ id: 'a', x: 0, y: 0 }],
      })

      await autoLayoutNodes([node], [])

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.children[0].width).toBe(260)
      expect(graphArg.children[0].height).toBe(160)
    })

    it('uses measured dimensions when available', async () => {
      const node = makeNode('a') as Node & { measured?: { width: number; height: number } }
      node.measured = { width: 300, height: 120 }

      mockLayout.mockResolvedValue({
        children: [{ id: 'a', x: 0, y: 0 }],
      })

      await autoLayoutNodes([node], [])

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.children[0].width).toBe(300)
      expect(graphArg.children[0].height).toBe(120)
    })

    it('passes layout options to ELK graph', async () => {
      const nodes = [makeNode('a')]

      mockLayout.mockResolvedValue({
        children: [{ id: 'a', x: 0, y: 0 }],
      })

      await autoLayoutNodes(nodes, [], {
        direction: 'DOWN',
        nodeSpacing: 80,
        layerSpacing: 120,
        edgeSpacing: 40,
      })

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.layoutOptions['elk.direction']).toBe('DOWN')
      expect(graphArg.layoutOptions['elk.spacing.nodeNode']).toBe('80')
      expect(graphArg.layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('120')
      expect(graphArg.layoutOptions['elk.spacing.edgeNode']).toBe('40')
      expect(graphArg.layoutOptions['elk.spacing.edgeEdge']).toBe('40')
    })

    it('uses default layout options when none provided', async () => {
      const nodes = [makeNode('a')]

      mockLayout.mockResolvedValue({
        children: [{ id: 'a', x: 0, y: 0 }],
      })

      await autoLayoutNodes(nodes, [])

      const graphArg = mockLayout.mock.calls[0][0]
      expect(graphArg.layoutOptions['elk.direction']).toBe('RIGHT')
      expect(graphArg.layoutOptions['elk.spacing.nodeNode']).toBe('60')
      expect(graphArg.layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('100')
    })
  })

  // -----------------------------------------------------------------------
  // getNodesBounds
  // -----------------------------------------------------------------------
  describe('getNodesBounds', () => {
    it('returns zeroes for an empty array', () => {
      const bounds = getNodesBounds([])
      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0,
      })
    })

    it('returns correct bounding box for a single node', () => {
      const node = makeNode('a', 10, 20)
      const bounds = getNodesBounds([node])

      // Default dimensions: 260 x 160
      expect(bounds.minX).toBe(10)
      expect(bounds.minY).toBe(20)
      expect(bounds.maxX).toBe(10 + 260)
      expect(bounds.maxY).toBe(20 + 160)
      expect(bounds.width).toBe(260)
      expect(bounds.height).toBe(160)
    })

    it('returns correct bounding box for multiple nodes', () => {
      const nodes = [
        makeNode('a', 0, 0),
        makeNode('b', 300, 200),
      ]
      const bounds = getNodesBounds(nodes)

      expect(bounds.minX).toBe(0)
      expect(bounds.minY).toBe(0)
      expect(bounds.maxX).toBe(300 + 260) // b.x + default width
      expect(bounds.maxY).toBe(200 + 160)  // b.y + default height
      expect(bounds.width).toBe(560)
      expect(bounds.height).toBe(360)
    })

    it('uses explicit width/height when set on node', () => {
      const node = makeNode('a', 10, 10, 100, 50)
      const bounds = getNodesBounds([node])

      expect(bounds.maxX).toBe(10 + 100)
      expect(bounds.maxY).toBe(10 + 50)
      expect(bounds.width).toBe(100)
      expect(bounds.height).toBe(50)
    })

    it('uses measured dimensions when available', () => {
      const node = makeNode('a', 0, 0) as Node & { measured?: { width: number; height: number } }
      node.measured = { width: 400, height: 150 }

      const bounds = getNodesBounds([node])

      expect(bounds.maxX).toBe(400)
      expect(bounds.maxY).toBe(150)
      expect(bounds.width).toBe(400)
      expect(bounds.height).toBe(150)
    })

    it('prefers measured dimensions over explicit width/height', () => {
      const node = makeNode('a', 0, 0, 100, 50) as Node & { measured?: { width: number; height: number } }
      node.measured = { width: 200, height: 90 }

      const bounds = getNodesBounds([node])

      // measured should take priority
      expect(bounds.width).toBe(200)
      expect(bounds.height).toBe(90)
    })

    it('handles nodes with negative positions', () => {
      const nodes = [
        makeNode('a', -100, -50),
        makeNode('b', 100, 50),
      ]
      const bounds = getNodesBounds(nodes)

      expect(bounds.minX).toBe(-100)
      expect(bounds.minY).toBe(-50)
      expect(bounds.maxX).toBe(100 + 260)
      expect(bounds.maxY).toBe(50 + 160)
      expect(bounds.width).toBe(460) // 360 - (-100)
      expect(bounds.height).toBe(260) // 210 - (-50)
    })
  })
})
