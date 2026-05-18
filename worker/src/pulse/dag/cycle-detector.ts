/**
 * Cycle Detector — Phase 4N-a, Task 28.
 *
 * Pure function. Given a set of existing edges (e.g. edges already in a
 * live DAG) and a set of proposed additions (from a template or
 * agent-authored expansion), determines whether the combined graph
 * contains a directed cycle using DFS with three-color marking.
 *
 * Colors:
 *   white — unvisited
 *   gray  — on current DFS stack (back-edge to gray = cycle)
 *   black — fully explored
 *
 * Returns the first cycle found (as the node sequence on the DFS stack
 * from the cycle start back around to itself). Used for diagnostics in
 * `DagCycleError`.
 *
 * Time: O(V + E). Space: O(V).
 */

export interface EdgeRef {
  /** Stable identifier for the parent node (UUID or template node_key). */
  parent: string
  /** Stable identifier for the child node. */
  child: string
}

export interface CycleResult {
  hasCycle: boolean
  /** If a cycle was found, the node sequence forming the cycle. */
  cycleNodes?: string[]
}

enum Color {
  White = 0,
  Gray = 1,
  Black = 2,
}

export function detectCycle(
  existingEdges: readonly EdgeRef[],
  proposedEdges: readonly EdgeRef[],
): CycleResult {
  // Build adjacency list over the union of both edge sets.
  const adj = new Map<string, string[]>()
  const nodes = new Set<string>()

  const addEdge = (e: EdgeRef) => {
    nodes.add(e.parent)
    nodes.add(e.child)
    const list = adj.get(e.parent)
    if (list) list.push(e.child)
    else adj.set(e.parent, [e.child])
  }

  for (const e of existingEdges) addEdge(e)
  for (const e of proposedEdges) addEdge(e)

  const color = new Map<string, Color>()
  for (const n of nodes) color.set(n, Color.White)

  // Iterative DFS with an explicit stack of frames (node, childIndex)
  // so deep graphs don't blow the recursion stack.
  interface Frame {
    node: string
    children: string[]
    idx: number
  }

  const parent = new Map<string, string | null>()

  for (const start of nodes) {
    if (color.get(start) !== Color.White) continue

    const stack: Frame[] = [
      { node: start, children: adj.get(start) ?? [], idx: 0 },
    ]
    color.set(start, Color.Gray)
    parent.set(start, null)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      if (frame.idx >= frame.children.length) {
        color.set(frame.node, Color.Black)
        stack.pop()
        continue
      }
      const child = frame.children[frame.idx++]!
      const c = color.get(child) ?? Color.White
      if (c === Color.Gray) {
        // Back-edge → cycle. Reconstruct by walking parent chain from
        // frame.node back to `child`, then append `child` to close.
        const cycle: string[] = [child]
        let cursor: string | null = frame.node
        while (cursor && cursor !== child) {
          cycle.push(cursor)
          cursor = parent.get(cursor) ?? null
        }
        cycle.push(child)
        cycle.reverse()
        return { hasCycle: true, cycleNodes: cycle }
      }
      if (c === Color.White) {
        color.set(child, Color.Gray)
        parent.set(child, frame.node)
        stack.push({ node: child, children: adj.get(child) ?? [], idx: 0 })
      }
    }
  }

  return { hasCycle: false }
}
