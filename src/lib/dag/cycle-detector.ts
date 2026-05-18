/**
 * Cycle Detector — control-plane mirror of
 * `worker/src/pulse/dag/cycle-detector.ts`.
 *
 * Pure function. Three-color DFS with an explicit frame stack so deep graphs
 * don't blow the recursion limit. Identical algorithm to the worker version —
 * we mirror rather than share because the worker has `rootDir: ./src` and
 * cannot import from here. No behavioral drift allowed: contract-sync tests
 * exist for the DAG types; if we ever diverge here, add a similar test.
 */

import 'server-only'

export interface EdgeRef {
  parent: string
  child: string
}

export interface CycleResult {
  hasCycle: boolean
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
