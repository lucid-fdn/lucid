'use client'

/**
 * Shared ReactFlow Canvas Shell
 *
 * Centralized wrapper for all ReactFlow-based canvases in the app.
 * Handles common setup: Background, Controls, MiniMap, fitView, theming.
 * Each consumer provides their own nodeTypes, edgeTypes, and interaction handlers.
 *
 * Used by:
 *   - Mission Control Agent Canvas (read-only topology)
 *   - Workflow Builder (interactive editor) — can migrate later
 *   - Any future canvas (A/B test visualizer, conversation flow, etc.)
 */

import {
  useCallback,
  useRef,
  forwardRef,
  type ReactNode,
  type CSSProperties,
} from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
  type ReactFlowInstance,
  type MiniMapNodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'

// ─── Shared theme constants ───

const BACKGROUND_COLOR = 'hsl(var(--muted-foreground) / 0.07)'
const CONTROLS_CLASS =
  '!bg-background/80 !backdrop-blur-sm !border !shadow-sm [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground'
const MINIMAP_CLASS =
  '!bg-background/80 !backdrop-blur-sm !border !shadow-sm'
const MINIMAP_MASK = 'hsl(var(--muted) / 0.5)'

// ─── Types ───

export interface ReactFlowCanvasProps {
  /** Nodes to render */
  nodes: Node[]
  /** Edges to render */
  edges: Edge[]
  /** Node change handler (from useNodesState) */
  onNodesChange: (changes: NodeChange[]) => void
  /** Edge change handler (from useEdgesState) */
  onEdgesChange: (changes: EdgeChange[]) => void
  /** Custom node type registry */
  nodeTypes: NodeTypes
  /** Custom edge type registry */
  edgeTypes?: EdgeTypes

  // ─── Optional interaction handlers ───

  /** Connection handler (for editable canvases) */
  onConnect?: OnConnect
  /** Node click handler */
  onNodeClick?: (event: React.MouseEvent, node: Node) => void
  /** Node double-click handler */
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void
  /** Node context-menu handler (right-click) */
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void
  /** Pane click handler (e.g. deselect) */
  onPaneClick?: () => void
  /** Called when ReactFlow instance is ready */
  onReady?: (instance: ReactFlowInstance) => void

  // ─── Layout & behavior ───

  /** Whether nodes can be dragged (default: true) */
  nodesDraggable?: boolean
  /** Whether nodes can be connected (default: false) */
  nodesConnectable?: boolean
  /** Whether elements are selectable (default: true) */
  elementsSelectable?: boolean
  /** Pan on scroll (default: true) */
  panOnScroll?: boolean
  /** Min zoom level (default: 0.2) */
  minZoom?: number
  /** Max zoom level (default: 2) */
  maxZoom?: number
  /** Fit view padding (default: 0.25) */
  fitViewPadding?: number
  /** Delete key codes (default: none for read-only) */
  deleteKeyCode?: string | string[] | null

  // ─── Visual ───

  /** Background gap (default: 20) */
  backgroundGap?: number
  /** Show MiniMap (default: true) */
  showMiniMap?: boolean
  /** Show Controls (default: true) */
  showControls?: boolean
  /** MiniMap node color function */
  miniMapNodeColor?: (node: Node) => string
  /** Default MiniMap node color (default: muted) */
  defaultMiniMapNodeColor?: string
  /** Children rendered inside ReactFlow (e.g. custom overlays) */
  children?: ReactNode
  /** Additional className on the wrapper div */
  className?: string
  /** Additional style on the wrapper div */
  style?: CSSProperties
}

// ─── Component ───

export const ReactFlowCanvas = forwardRef<HTMLDivElement, ReactFlowCanvasProps>(function ReactFlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  nodeTypes,
  edgeTypes,
  onConnect,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onPaneClick,
  onReady,
  nodesDraggable = true,
  nodesConnectable = false,
  elementsSelectable = true,
  panOnScroll = true,
  minZoom = 0.2,
  maxZoom = 2,
  fitViewPadding = 0.25,
  deleteKeyCode = null,
  backgroundGap = 20,
  showMiniMap = true,
  showControls = true,
  miniMapNodeColor,
  defaultMiniMapNodeColor = 'hsl(var(--muted-foreground) / 0.3)',
  children,
  className,
  style,
}, ref) {
  const instanceRef = useRef<ReactFlowInstance | null>(null)

  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      instanceRef.current = instance
      instance.fitView({ padding: fitViewPadding, maxZoom: Math.min(maxZoom, 1.2), duration: 300 })
      onReady?.(instance)
    },
    [fitViewPadding, maxZoom, onReady],
  )

  return (
    <div ref={ref} className={className} style={{ height: '100%', width: '100%', ...style }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={handleInit}
        fitView
        minZoom={minZoom}
        maxZoom={maxZoom}
        nodesDraggable={nodesDraggable}
        nodesConnectable={nodesConnectable}
        elementsSelectable={elementsSelectable}
        panOnScroll={panOnScroll}
        selectionOnDrag={false}
        deleteKeyCode={deleteKeyCode}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={backgroundGap} size={1} color={BACKGROUND_COLOR} />
        {showControls && (
          <Controls showInteractive={false} className={CONTROLS_CLASS} />
        )}
        {showMiniMap && (
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            className={MINIMAP_CLASS}
            maskColor={MINIMAP_MASK}
            nodeColor={miniMapNodeColor ?? (() => defaultMiniMapNodeColor)}
          />
        )}
        {children}
      </ReactFlow>
    </div>
  )
})

/** Helper: get the ReactFlow instance ref for imperative actions (fitView, etc.) */
export { type ReactFlowInstance }
