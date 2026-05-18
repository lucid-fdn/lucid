'use client'

/**
 * Workflow Template Visualizer.
 *
 * Read-only ReactFlow rendering of a DagSpec. Lays out nodes by BFS level
 * (parents → children by `order` edges) and colors them by node_type so
 * operators can eyeball structure at a glance.
 *
 * Not editable — this is a preview pane used alongside DagTemplateEditor
 * and in any future read-only workflow inspection surface.
 */

import { useMemo } from 'react'
import type { Node, Edge, NodeTypes } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { ReactFlowCanvas } from '@/components/shared/react-flow-canvas'
import type { DagSpec, DagNodeType } from '@contracts/dag'

// ─── Color map by node_type (aligned with design tokens) ───

const NODE_COLORS: Record<DagNodeType, { bg: string; border: string; label: string }> = {
  leaf: {
    bg: 'hsl(var(--muted) / 0.5)',
    border: 'hsl(var(--border))',
    label: 'Leaf',
  },
  group: {
    bg: 'hsl(217 91% 60% / 0.15)',
    border: 'hsl(217 91% 60%)',
    label: 'Group',
  },
  barrier: {
    bg: 'hsl(45 93% 47% / 0.15)',
    border: 'hsl(45 93% 47%)',
    label: 'Barrier',
  },
  expansion_zone: {
    bg: 'hsl(280 70% 60% / 0.15)',
    border: 'hsl(280 70% 60%)',
    label: 'Expansion',
  },
  approval: {
    bg: 'hsl(0 72% 51% / 0.15)',
    border: 'hsl(0 72% 51%)',
    label: 'Approval',
  },
  human_task: {
    bg: 'hsl(160 70% 45% / 0.15)',
    border: 'hsl(160 70% 45%)',
    label: 'Human Task',
  },
}

// ─── Custom node renderer (read-only card) ───

interface DagSpecNodeData {
  label: string
  nodeType: DagNodeType
  stepType?: string
}

function DagSpecNodeCard({ data }: { data: DagSpecNodeData }) {
  const color = NODE_COLORS[data.nodeType] ?? NODE_COLORS.leaf
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{
        background: color.bg,
        borderColor: color.border,
        minWidth: 140,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="font-mono font-medium truncate">{data.label}</div>
      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
        <span>{color.label}</span>
        {data.stepType && <span>· {data.stepType}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const NODE_TYPES: NodeTypes = {
  dagSpecNode: DagSpecNodeCard,
}

// ─── BFS layering layout ───

interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

function layoutSpec(spec: DagSpec): LayoutResult {
  const byKey = new Map(spec.nodes.map((n) => [n.node_key, n]))
  const childrenByKey = new Map<string, string[]>()
  const parentCount = new Map<string, number>()

  for (const node of spec.nodes) {
    parentCount.set(node.node_key, 0)
    childrenByKey.set(node.node_key, [])
  }
  for (const edge of spec.edges) {
    if (!byKey.has(edge.parent) || !byKey.has(edge.child)) continue
    childrenByKey.get(edge.parent)!.push(edge.child)
    parentCount.set(edge.child, (parentCount.get(edge.child) ?? 0) + 1)
  }

  // BFS from roots (nodes with no parents)
  const level = new Map<string, number>()
  const queue: string[] = []
  for (const [key, count] of parentCount.entries()) {
    if (count === 0) {
      level.set(key, 0)
      queue.push(key)
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    const curLevel = level.get(cur) ?? 0
    for (const child of childrenByKey.get(cur) ?? []) {
      const nextLevel = curLevel + 1
      if ((level.get(child) ?? -1) < nextLevel) {
        level.set(child, nextLevel)
        queue.push(child)
      }
    }
  }
  // Fallback: any node missed by BFS should land at level 0.
  for (const node of spec.nodes) {
    if (!level.has(node.node_key)) level.set(node.node_key, 0)
  }

  // Group nodes per level for horizontal spacing
  const byLevel = new Map<number, string[]>()
  for (const [key, lvl] of level.entries()) {
    const bucket = byLevel.get(lvl) ?? []
    bucket.push(key)
    byLevel.set(lvl, bucket)
  }

  const X_GAP = 200
  const Y_GAP = 100

  const nodes: Node[] = []
  for (const [lvl, keys] of byLevel.entries()) {
    keys.sort()
    const rowWidth = (keys.length - 1) * X_GAP
    keys.forEach((key, i) => {
      const specNode = byKey.get(key)!
      nodes.push({
        id: key,
        type: 'dagSpecNode',
        position: {
          x: i * X_GAP - rowWidth / 2,
          y: lvl * Y_GAP,
        },
        data: {
          label: key,
          nodeType: specNode.node_type,
          stepType: specNode.step_type,
        },
      })
    })
  }

  const edges: Edge[] = spec.edges
    .filter((e) => byKey.has(e.parent) && byKey.has(e.child))
    .map((e, i) => ({
      id: `e-${i}-${e.parent}-${e.child}`,
      source: e.parent,
      target: e.child,
      type: 'smoothstep',
      style:
        e.edge_kind === 'barrier'
          ? { stroke: 'hsl(45 93% 47%)', strokeDasharray: '4 2' }
          : e.edge_kind === 'data'
            ? { stroke: 'hsl(217 91% 60%)' }
            : { stroke: 'hsl(var(--muted-foreground) / 0.5)' },
    }))

  return { nodes, edges }
}

// ─── Component ───

export interface DagTemplateVisualizerProps {
  spec: DagSpec
  className?: string
}

export function DagTemplateVisualizer({ spec, className }: DagTemplateVisualizerProps) {
  const { nodes, edges } = useMemo(() => layoutSpec(spec), [spec])

  return (
    <div
      className={className}
      style={{ height: '100%', width: '100%', minHeight: 320 }}
    >
      <ReactFlowCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={() => {}}
        onEdgesChange={() => {}}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        showMiniMap={false}
        miniMapNodeColor={(n) => {
          const data = n.data as DagSpecNodeData | undefined
          return data?.nodeType
            ? NODE_COLORS[data.nodeType].border
            : 'hsl(var(--muted-foreground) / 0.3)'
        }}
      />
    </div>
  )
}
