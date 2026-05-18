import type { Node } from 'reactflow'

// ─── Shared type for ReactFlow nodes with DOM measurements ───

export interface NodeWithMeasured extends Node {
  measured?: { width?: number; height?: number }
}

// ─── Group layout constants (single source of truth) ───

export const GROUP_LAYOUT = {
  /** Padding inside group container */
  pad: 10,
  /** Height reserved for group header bar (icon + label + kebab) */
  headerH: 34,
  /** Horizontal gap between children in grid */
  gapX: 10,
  /** Vertical gap between children in grid */
  gapY: 10,
  /** Fallback width when node hasn't been measured yet */
  defaultChildW: 260,
  /** Fallback height when node hasn't been measured yet (smaller than ELK's 160 default — group children use compact sizing) */
  defaultChildH: 160,
  /** Max columns in child grid layout (1 = vertical stack, Railway-style) */
  maxCols: 1,
  /** Minimum group width */
  minW: 284,
  /** Minimum group height */
  minH: 150,
} as const

// ─── Helpers ───

/** Read the actual rendered size of a node, falling back to specified or default dimensions. */
export function getNodeSize(node: Node): { w: number; h: number } {
  const measured = (node as NodeWithMeasured).measured
  return {
    w: measured?.width ?? node.width ?? GROUP_LAYOUT.defaultChildW,
    h: measured?.height ?? node.height ?? GROUP_LAYOUT.defaultChildH,
  }
}

/** Compute grid positions and container size for N children inside a group. */
export function computeGroupGrid(childSizes: { w: number; h: number }[]): {
  positions: { x: number; y: number }[]
  groupW: number
  groupH: number
} {
  const { pad, headerH, gapX, gapY, maxCols, minW, minH } = GROUP_LAYOUT
  const count = childSizes.length
  if (count === 0) return { positions: [], groupW: minW, groupH: minH }

  const maxChildW = Math.max(...childSizes.map((s) => s.w))

  // Stack children vertically using each child's actual height (not uniform maxChildH).
  // This prevents tall outlier nodes from adding excessive gaps to every row.
  const positions: { x: number; y: number }[] = []
  let cursorY = headerH + pad
  for (let i = 0; i < count; i++) {
    const col = i % maxCols
    const row = Math.floor(i / maxCols)

    // At the start of each row, compute Y from cumulative heights of previous rows
    if (col === 0 && row > 0) {
      // Find the tallest child in the previous row
      const prevRowStart = (row - 1) * maxCols
      const prevRowEnd = Math.min(prevRowStart + maxCols, count)
      let prevRowMaxH = 0
      for (let j = prevRowStart; j < prevRowEnd; j++) {
        prevRowMaxH = Math.max(prevRowMaxH, childSizes[j].h)
      }
      cursorY += prevRowMaxH + gapY
    }

    positions.push({
      x: pad + col * (maxChildW + gapX),
      y: cursorY,
    })
  }

  // Compute total height from cumulative stacking
  const lastRowStart = Math.floor((count - 1) / maxCols) * maxCols
  const lastRowEnd = count
  let lastRowMaxH = 0
  for (let j = lastRowStart; j < lastRowEnd; j++) {
    lastRowMaxH = Math.max(lastRowMaxH, childSizes[j].h)
  }
  const totalChildrenH = cursorY - (headerH + pad) + lastRowMaxH

  const cols = Math.min(count, maxCols)
  const groupW = Math.max(minW, pad * 2 + cols * maxChildW + Math.max(0, cols - 1) * gapX)
  const groupH = Math.max(minH, headerH + pad + totalChildrenH + pad)

  return { positions, groupW, groupH }
}

/**
 * Compute bounding box of children and return the parent size + child position offsets
 * needed to hug them tightly with standard padding.
 * Returns null if no repositioning is needed (within 1px tolerance).
 */
export function computeFitToChildren(
  parent: Node,
  children: Node[],
): { parentDelta: { dx: number; dy: number }; childDelta: { dx: number; dy: number }; newW: number; newH: number } | null {
  if (children.length === 0) return null

  const { pad, headerH } = GROUP_LAYOUT
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const child of children) {
    const { w, h } = getNodeSize(child)
    minX = Math.min(minX, child.position.x)
    minY = Math.min(minY, child.position.y)
    maxX = Math.max(maxX, child.position.x + w)
    maxY = Math.max(maxY, child.position.y + h)
  }

  const targetMinX = pad
  const targetMinY = headerH + pad
  const dx = targetMinX - minX
  const dy = targetMinY - minY
  const newW = maxX - minX + pad * 2
  const newH = maxY - minY + pad + headerH + pad

  const oldW = (parent.style?.width as number) ?? GROUP_LAYOUT.minW
  const oldH = (parent.style?.height as number) ?? GROUP_LAYOUT.minH

  // Skip if nothing changed (within 1px tolerance)
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(newW - oldW) < 1 && Math.abs(newH - oldH) < 1) {
    return null
  }

  return {
    parentDelta: { dx: -dx, dy: -dy },
    childDelta: { dx, dy },
    newW: Math.max(GROUP_LAYOUT.minW, newW),
    newH: Math.max(GROUP_LAYOUT.minH, newH),
  }
}
