'use client'

import { startTransition, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ReactFlowProvider,
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
  type OnSelectionChangeParams,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Network, Maximize2, RotateCcw, Plus, Undo2, Redo2, Trash2, ExternalLink, Copy, Loader2, PowerOff, Power, Users, Pencil, XCircle, X, FolderOpen, FolderPlus, Check, LayoutGrid, Palette, BoxSelect } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { CanvasGridSurface } from '@/components/ui/canvas-grid-surface'
import { AssistantCanvasNode, type AssistantNodeData } from '@/components/assistants/assistant-canvas-node'
import type { DeployingNodeData } from '@/components/assistants/deploying-canvas-node'
import { AgentBuilderDraftNode, type AgentBuilderDraftNodeData } from '@/components/assistants/draft-agent-canvas-node'
import { CrewCanvasNode, type CrewNodeData } from '@/components/assistants/crew-canvas-node'
import { GroupCanvasNode, type GroupNodeData } from '@/components/assistants/group-canvas-node'
import { DataFlowEdge } from '@/components/mission-control/canvas/data-flow-edge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { autoLayoutNodes, type LayoutGroup } from '@/lib/workflow/auto-layout'
import { GROUP_LAYOUT, getNodeSize, computeGroupGrid, computeFitToChildren } from '@/lib/workflow/group-layout'
import type { Agent as Assistant } from '@/types/agent'
import { derivePresenceState } from '@/lib/mission-control/presence'
import type { FeedEvent, CanvasTopologyData } from '@/lib/mission-control/types'
import { cn } from '@/lib/utils'
import type { Crew, CrewMember, CrewEdge } from '@contracts/crew'
import { notificationCopy } from '@/lib/notifications/copy'
import {
  GROUP_COLOR_LABELS,
  GROUP_COLORS,
  getAgentStatus,
  positionsKey,
} from './agents-canvas-model'
import { CanvasToolbar } from './agents-canvas-toolbar'
import {
  type CanvasGroup,
  loadGroupsLocal,
  loadPositionsLocal,
  saveGroupsLocal,
  savePositionsLocal,
} from './agents-canvas-storage'

const canvasNodeTypes: NodeTypes = {
  assistant: AssistantCanvasNode,
  deploying: AssistantCanvasNode,
  draftAgent: AgentBuilderDraftNode,
  crew: CrewCanvasNode,
  canvasGroup: GroupCanvasNode,
} as unknown as NodeTypes

const canvasEdgeTypes: EdgeTypes = {
  dataflow: DataFlowEdge,
} as unknown as EdgeTypes

type CanvasDeployingNode = {
  id: string
  label: string
  phase: DeployingNodeData['phase']
  l2Status?: DeployingNodeData['l2Status']
  startedAt?: number
  createdAgentId?: string | null
  onRetry?: () => void
  onCancel?: () => void
}

function feedEventSignature(events: FeedEvent[] | undefined): string {
  if (!events?.length) return '0'
  const last = events[events.length - 1]
  return `${events.length}:${last?.id ?? ''}:${last?.created_at ?? ''}:${last?.event_type ?? ''}`
}

/** Merge DOM-measured dimensions from ReactFlow instance into freshly-built nodes so ELK uses accurate sizes. */
function mergeDOMMeasurements(nodes: Node[], reactFlowRef: React.RefObject<ReactFlowInstance | null>) {
  const measured = reactFlowRef.current?.getNodes()
  if (!measured) return
  const measuredMap = new Map(measured.map((n) => [n.id, n]))
  for (const node of nodes) {
    const m = measuredMap.get(node.id)
    if (m?.width != null) node.width = m.width
    if (m?.height != null) (node as Record<string, unknown>).height = m.height
  }
}

function preserveLiveNodeData(nextNodes: Node[], currentNodes: Node[]): Node[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return nextNodes.map((node) => {
    const current = currentById.get(node.id)
    if (!current) return node
    if (node.type !== 'assistant' && node.type !== 'deploying' && node.type !== 'draftAgent') return node
    return {
      ...node,
      selected: current.selected,
      data: current.data,
    }
  })
}

/** Debounced DB persistence — writes localStorage immediately, syncs to DB after 2s idle */
function useCanvasConfigSync(workspaceId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<{ positions: Record<string, { x: number; y: number }>; groups: CanvasGroup[] }>({ positions: {}, groups: [] })

  const flush = useCallback(() => {
    const { positions, groups } = latestRef.current
    fetch(`/api/organizations/${workspaceId}/canvas-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions, groups }),
    }).catch(() => { /* silent — localStorage is the fallback */ })
  }, [workspaceId])

  const savePositions = useCallback((nodes: Node[]) => {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const n of nodes) positions[n.id] = n.position
    latestRef.current.positions = positions
    savePositionsLocal(workspaceId, nodes)
    // Debounce DB write
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 2000)
  }, [workspaceId, flush])

  const saveGroups = useCallback((groups: CanvasGroup[]) => {
    latestRef.current.groups = groups
    saveGroupsLocal(workspaceId, groups)
    // Debounce DB write
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 2000)
  }, [workspaceId, flush])

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        flush()
      }
    }
  }, [flush])

  return { savePositions, saveGroups }
}

/** Simple undo/redo stack for node positions */
function useUndoRedo(setRfNodes: React.Dispatch<React.SetStateAction<Node[]>>, persistPositions: (nodes: Node[]) => void) {
  const undoStack = useRef<Node[][]>([])
  const redoStack = useRef<Node[][]>([])

  const pushSnapshot = useCallback((nodes: Node[]) => {
    undoStack.current.push(nodes.map((n) => ({ ...n, position: { ...n.position } })))
    redoStack.current = []
    if (undoStack.current.length > 30) undoStack.current.shift()
  }, [])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    setRfNodes((current) => {
      redoStack.current.push(current.map((n) => ({ ...n, position: { ...n.position } })))
      const prev = undoStack.current.pop()!
      persistPositions(prev)
      return prev
    })
  }, [setRfNodes, persistPositions])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    setRfNodes((current) => {
      undoStack.current.push(current.map((n) => ({ ...n, position: { ...n.position } })))
      const next = redoStack.current.pop()!
      persistPositions(next)
      return next
    })
  }, [setRfNodes, persistPositions])

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  return { pushSnapshot, undo, redo, canUndo, canRedo }
}

function AssistantsCanvasInner({
  assistants,
  workspaceSlug,
  workspaceId,
  feedEvents,
  onAgentSelect,
  onTeamSelect,
  onGroupSelect,
  onAddAgent,
  onPaneClick,
  initialFocusAgentId,
  initialFocusTeamId,
  deployingNode,
  draftAgentNode,
  hideDraftAgentNode,
  replaceGroupRequest,
  onReplaceGroupHandled,
  crews,
  crewMembers,
  crewEdges,
  onCreateCrewFromSelection,
  onCreateCrewFromGroup,
  onCreateCrew,
  onCrewMemberAdded,
  onCrewMemberRemoved,
  onCrewRenamed,
  onCrewDissolved,
  topologyData,
  onReady,
}: {
  assistants: Assistant[]
  workspaceSlug: string
  workspaceId: string
  feedEvents: FeedEvent[]
  onAgentSelect?: (agentId: string) => void
  onTeamSelect?: (crewId: string) => void
  onGroupSelect?: (group: { id: string; name: string; memberIds: string[] } | null) => void
  onAddAgent?: () => void
  onPaneClick?: () => void
  initialFocusAgentId?: string | null
  initialFocusTeamId?: string | null
  deployingNode?: CanvasDeployingNode | null
  draftAgentNode?: ({ id: string; focusVersion?: number } & AgentBuilderDraftNodeData) | null
  hideDraftAgentNode?: boolean
  replaceGroupRequest?: { groupId: string; nonce: number } | null
  onReplaceGroupHandled?: () => void
  crews?: Crew[]
  crewMembers?: Record<string, CrewMember[]>
  crewEdges?: Record<string, CrewEdge[]>
  onCreateCrewFromSelection?: (assistantIds: string[]) => void
  onCreateCrewFromGroup?: (groupId: string, name: string, assistantIds: string[]) => void
  onCreateCrew?: () => void
  onCrewMemberAdded?: (crewId: string, assistantId: string) => void
  onCrewMemberRemoved?: (crewId: string, assistantId: string) => void
  onCrewRenamed?: (crewId: string, name: string) => void
  onCrewDissolved?: (crewId: string) => void
  topologyData?: CanvasTopologyData
  onReady?: () => void
}) {
  const router = useRouter()
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [layouting, setLayouting] = useState(false)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedInitialFocusRef = useRef<string | null>(null)
  const appliedDraftFocusRef = useRef<string | null>(null)
  // DB-backed canvas config (positions + groups) with debounced persistence
  const { savePositions, saveGroups } = useCanvasConfigSync(workspaceId)
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo(setRfNodes, savePositions)

  // Track which node was right-clicked for contextual menu items
  const [rightClickedNode, setRightClickedNode] = useState<{ id: string; label: string; isActive: boolean } | null>(null)

  // Track right-clicked crew node for crew context menu (Feature 6)
  const [rightClickedCrew, setRightClickedCrew] = useState<{ crewId: string; name: string } | null>(null)

  // Track right-clicked group node for group context menu
  const [rightClickedGroup, setRightClickedGroup] = useState<{ groupId: string; name: string } | null>(null)

  // Trigger inline rename on a crew node (set from context menu, read by node data)
  const [renamingCrewId, setRenamingCrewId] = useState<string | null>(null)
  const [dragHoverCrewId, setDragHoverCrewId] = useState<string | null>(null)
  const [dragHoverGroupId, setDragHoverGroupId] = useState<string | null>(null)

  // User-created groups (Railway-style node grouping)
  const [canvasGroups, setCanvasGroups] = useState<CanvasGroup[]>(() => loadGroupsLocal(workspaceId))
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const dbHydratedRef = useRef(false)

  // Hydrate from DB on mount (DB wins over localStorage)
  useEffect(() => {
    if (dbHydratedRef.current) return
    dbHydratedRef.current = true
    fetch(`/api/organizations/${workspaceId}/canvas-config`)
      .then((r) => r.ok ? r.json() : null)
      .then((cfg) => {
        if (!cfg) return
        if (cfg.groups?.length > 0) {
          skipLayoutRef.current++  // DB hydration must not trigger a second full layout
          setCanvasGroups(cfg.groups)
          saveGroupsLocal(workspaceId, cfg.groups)
        }
        if (cfg.positions && Object.keys(cfg.positions).length > 0) {
          savePositionsLocal(workspaceId, cfg.positions)
        }
      })
      .catch(() => { /* localStorage fallback is fine */ })
  }, [workspaceId])

  // Group member lookup (assistantId → groupId)
  const groupMemberLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const g of canvasGroups) {
      for (const id of g.memberIds) {
        lookup.set(id, g.id)
      }
    }
    return lookup
  }, [canvasGroups])

  // Counter: when group operations mutate canvasGroups, skip the next N layout effect re-runs.
  // Using a counter (not boolean) handles rapid successive mutations correctly.
  const skipLayoutRef = useRef(0)

  // Ref to addToGroup so createGroup can call it without circular dep
  const addToGroupRef = useRef<(groupId: string, assistantId: string) => void>(() => {})

  const createGroup = useCallback((name: string, initialMemberId?: string) => {
    const id = crypto.randomUUID().slice(0, 8)
    const color = GROUP_COLORS[canvasGroups.length % GROUP_COLORS.length]
    const newGroup: CanvasGroup = { id, name, color, memberIds: [] }
    const updated = [...canvasGroups, newGroup]
    skipLayoutRef.current++
    setCanvasGroups(updated)
    saveGroups(updated)

    // Create the group node in ReactFlow immediately so addToGroup can find it
    if (initialMemberId) {
      const nodeId = `group-${id}`
      setRfNodes((nodes) => {
        const childNode = nodes.find((n) => n.id === initialMemberId)
        return [
          ...nodes,
          {
            id: nodeId,
            type: 'canvasGroup' as const,
            position: childNode?.position ?? { x: 0, y: 0 },
            data: { name, color },
            style: { width: GROUP_LAYOUT.minW, height: GROUP_LAYOUT.minH },
          } as Node,
        ]
      })
      // Grid-layout the child inside the new group
      queueMicrotask(() => addToGroupRef.current(id, initialMemberId))
    }

    toast.success(`Group "${name}" created`)
    return id
  }, [canvasGroups, setRfNodes])

  // Canonical auto-fit: compute children bounding box, resize parent to hug them,
  // rebase children so they stay visually in place. Contracts AND expands.
  const fitGroupToChildren = useCallback((groupId: string) => {
    setRfNodes((nodes) => {
      const parentId = `group-${groupId}`
      const parent = nodes.find((n) => n.id === parentId)
      if (!parent) return nodes

      const children = nodes.filter((n) => n.parentNode === parentId)
      const fit = computeFitToChildren(parent, children)
      if (!fit) return nodes

      const result = nodes.map((n) => {
        if (n.id === parentId) {
          return {
            ...n,
            position: {
              x: n.position.x + fit.parentDelta.dx,
              y: n.position.y + fit.parentDelta.dy,
            },
            style: { ...n.style, width: fit.newW, height: fit.newH },
          }
        }
        if (n.parentNode === parentId) {
          return {
            ...n,
            position: {
              x: n.position.x + fit.childDelta.dx,
              y: n.position.y + fit.childDelta.dy,
            },
          }
        }
        return n
      })

      // Persist so layout effect doesn't revert
      savePositions(result)
      return result
    })
  }, [setRfNodes])

  const addToGroup = useCallback((groupId: string, assistantId: string) => {
    const parentId = `group-${groupId}`
    const { pad, headerH } = GROUP_LAYOUT

    // One atomic update: set parentNode, grid-layout children, resize group
    setRfNodes((nodes) => {
      // 1. Mark the new child as belonging to this group
      let updated = nodes.map((n) => {
        if (n.id === assistantId) {
          return { ...n, parentNode: parentId, position: { x: pad, y: headerH + pad } }
        }
        return n
      })

      // 2. Collect all children and compute grid layout
      const children = updated.filter((n) => n.parentNode === parentId && n.type === 'assistant')
      if (children.length === 0) return updated

      const childSizes = children.map((c) => getNodeSize(c))
      const { positions, groupW, groupH } = computeGroupGrid(childSizes)

      // 3. Apply grid positions to children
      const childIds = children.map((c) => c.id)
      updated = updated.map((n) => {
        const idx = childIds.indexOf(n.id)
        if (idx === -1) return n
        return { ...n, position: positions[idx] }
      })

      // 4. Resize the group node
      updated = updated.map((n) => {
        if (n.id === parentId) {
          return { ...n, style: { ...n.style, width: groupW, height: groupH } }
        }
        return n
      })

      // Persist positions so layout effect doesn't revert to old saved positions
      savePositions(updated)
      return updated
    })

    // Skip layout effect re-run — atomic setRfNodes above already positioned everything
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.map((g) => ({
        ...g,
        memberIds: g.id === groupId
          ? (g.memberIds.includes(assistantId) ? g.memberIds : [...g.memberIds, assistantId])
          : g.memberIds.filter((id) => id !== assistantId),
      }))
      saveGroups(updated)
      return updated
    })

    // Double-RAF: first frame lets React commit + ReactFlow measure the
    // re-parented node, second frame reads accurate measured sizes.
    requestAnimationFrame(() => requestAnimationFrame(() => fitGroupToChildren(groupId)))
  }, [setRfNodes, fitGroupToChildren])

  // Keep ref in sync with latest addToGroup
  addToGroupRef.current = addToGroup

  const removeFromGroup = useCallback((groupId: string, assistantId: string) => {
    // Convert node position: relative → absolute
    setRfNodes((nodes) => {
      const groupNode = nodes.find((n) => n.id === `group-${groupId}`)
      const childNode = nodes.find((n) => n.id === assistantId)
      if (!groupNode || !childNode) return nodes
      return nodes.map((n) => {
        if (n.id === assistantId) {
          const { parentNode: _p, extent: _e, expandParent: _ep, ...rest } = n
          return {
            ...rest,
            parentNode: undefined,
            position: {
              x: groupNode.position.x + childNode.position.x,
              y: groupNode.position.y + childNode.position.y,
            },
          }
        }
        return n
      })
    })
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.map((g) =>
        g.id === groupId
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== assistantId) }
          : g,
      )
      saveGroups(updated)
      return updated
    })
    // Auto-fit group after removing child (contracts if fewer children)
    fitGroupToChildren(groupId)
  }, [setRfNodes, fitGroupToChildren])

  const renameGroup = useCallback((groupId: string, newName: string) => {
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.map((g) => g.id === groupId ? { ...g, name: newName } : g)
      saveGroups(updated)
      return updated
    })
  }, [])

  const dissolveGroup = useCallback((groupId: string) => {
    const parentId = `group-${groupId}`
    // Convert children to absolute positions + remove group node
    setRfNodes((nodes) => {
      const groupNode = nodes.find((n) => n.id === parentId)
      const gx = groupNode?.position.x ?? 0
      const gy = groupNode?.position.y ?? 0
      return nodes
        .filter((n) => n.id !== parentId) // remove group node
        .map((n) => {
          if (n.parentNode === parentId) {
            const { parentNode: _p, ...rest } = n
            return { ...rest, parentNode: undefined, position: { x: gx + n.position.x, y: gy + n.position.y } }
          }
          return n
        })
    })
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.filter((g) => g.id !== groupId)
      saveGroups(updated)
      return updated
    })
    toast.success('Group dissolved')
  }, [setRfNodes])

  useEffect(() => {
    if (!replaceGroupRequest) return
    dissolveGroup(replaceGroupRequest.groupId)
    onReplaceGroupHandled?.()
  }, [dissolveGroup, onReplaceGroupHandled, replaceGroupRequest])

  const autoLayoutGroup = useCallback((groupId: string) => {
    const parentId = `group-${groupId}`
    skipLayoutRef.current++

    // Read DOM-measured dimensions from ReactFlow instance (more accurate than node.width/height)
    const measuredNodes = reactFlowRef.current?.getNodes()
    const measuredMap = new Map<string, { width?: number; height?: number }>()
    if (measuredNodes) {
      for (const n of measuredNodes) {
        if (n.width || n.height) measuredMap.set(n.id, { width: n.width ?? undefined, height: n.height ?? undefined })
      }
    }

    setRfNodes((nodes) => {
      const children = nodes.filter((n) => n.parentNode === parentId && n.type === 'assistant')
      if (children.length === 0) return nodes

      // Use DOM-measured sizes when available, fall back to getNodeSize
      const childSizes = children.map((c) => {
        const measured = measuredMap.get(c.id)
        return {
          w: measured?.width ?? c.width ?? GROUP_LAYOUT.defaultChildW,
          h: measured?.height ?? c.height ?? GROUP_LAYOUT.defaultChildH,
        }
      })
      const { positions, groupW, groupH } = computeGroupGrid(childSizes)

      const childIds = children.map((c) => c.id)
      const result = nodes.map((n) => {
        const idx = childIds.indexOf(n.id)
        if (idx !== -1) return { ...n, position: positions[idx] }
        if (n.id === parentId) return { ...n, style: { ...n.style, width: groupW, height: groupH } }
        return n
      })

      savePositions(result)
      return result
    })

    // Double-RAF: let React commit + ReactFlow measure, then fit group to actual DOM sizes
    requestAnimationFrame(() => requestAnimationFrame(() => fitGroupToChildren(groupId)))
  }, [setRfNodes, savePositions, fitGroupToChildren])

  const changeGroupColor = useCallback((groupId: string, color: string) => {
    const parentId = `group-${groupId}`
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.map((g) => g.id === groupId ? { ...g, color } : g)
      saveGroups(updated)
      return updated
    })
    setRfNodes((nodes) => nodes.map((n) =>
      n.id === parentId ? { ...n, data: { ...n.data, color } } : n,
    ))
  }, [setRfNodes])

  const changeGroupIcon = useCallback((groupId: string, icon: string) => {
    const parentId = `group-${groupId}`
    skipLayoutRef.current++
    setCanvasGroups((prev) => {
      const updated = prev.map((g) => g.id === groupId ? { ...g, icon } : g)
      saveGroups(updated)
      return updated
    })
    setRfNodes((nodes) => nodes.map((n) =>
      n.id === parentId ? { ...n, data: { ...n.data, icon } } : n,
    ))
  }, [setRfNodes])

  const selectAllInGroup = useCallback((groupId: string) => {
    const parentId = `group-${groupId}`
    const group = canvasGroups.find((g) => g.id === groupId)
    if (!group) return
    reactFlowRef.current?.setNodes((nodes) =>
      nodes.map((n) => ({ ...n, selected: n.parentNode === parentId && n.type === 'assistant' })),
    )
  }, [canvasGroups])

  // Focus halo — clicking an agent dims unrelated nodes/edges and shows a focus panel
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)

  // Track multi-selected assistant nodes for "Create Crew from Selection" (Feature 1)
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([])

  const onSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    const topLevelAssistantNodes = nodes.filter((n) => n.type === 'assistant' && !n.parentNode)
    const assistantIds = topLevelAssistantNodes.map((n) => n.id)
    setSelectedAssistantIds(assistantIds)

    if (nodes.length !== 1) return

    const [selectedNode] = nodes
    if (!selectedNode) return

    if (selectedNode.type === 'assistant') {
      setFocusedAgentId(selectedNode.id)
      onAgentSelect?.(selectedNode.id)
      onGroupSelect?.(null)
      return
    }

    if (selectedNode.type === 'crew') {
      const crewId = selectedNode.id.replace('crew-', '')
      setFocusedAgentId(null)
      onGroupSelect?.(null)
      onTeamSelect?.(crewId)
      return
    }

    if (selectedNode.type === 'canvasGroup') {
      const groupId = selectedNode.id.replace('group-', '')
      const selectedGroup = canvasGroups.find((group) => group.id === groupId) ?? null
      setFocusedAgentId(null)
      onGroupSelect?.(selectedGroup ? {
        id: selectedGroup.id,
        name: selectedGroup.name,
        memberIds: selectedGroup.memberIds,
      } : null)
    }
  }, [canvasGroups, onAgentSelect, onGroupSelect, onTeamSelect])

  // Delete agent state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Shutdown (pause) agent state
  const [shuttingDownId, setShuttingDownId] = useState<string | null>(null)
  const [resumingId, setResumingId] = useState<string | null>(null)

  const executeDelete = useCallback(async (target: { id: string; name: string }) => {
    setIsDeleting(true)
    setDeletingId(target.id)
    setDeleteTarget(null) // close dialog, node shows overlay
    try {
      // Ensure CSRF cookie is set (double-submit cookie pattern)
      // Always call /api/auth/csrf first to ensure cookie exists, then read it
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCSRFTokenFromCookie()
      if (!csrf) throw new Error('Could not obtain CSRF token — check cookies are enabled')
      console.log('[canvas] Deleting agent', target.id, 'csrf:', csrf.slice(0, 8) + '...')
      const res = await fetch(`/api/assistants/${target.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      })
      console.log('[canvas] Delete response:', res.status, res.statusText)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[canvas] Delete error body:', body)
        throw new Error(body.detail || body.error || `Failed (${res.status})`)
      }
      setRfNodes((nodes) => nodes.filter((n) => n.id !== target.id))
      startTransition(() => {
        router.refresh()
      })
      toast.success(notificationCopy.agent.deleted, {
        description: `${target.name} has been permanently deleted.`,
      })
    } catch (err) {
      console.error('[canvas] Delete agent failed:', err)
      toast.error(notificationCopy.agent.failedToDelete, {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }, [setRfNodes, router])

  const executeShutdown = useCallback(async (target: { id: string; name: string }) => {
    setShuttingDownId(target.id)
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCSRFTokenFromCookie()
      if (!csrf) throw new Error('Could not obtain CSRF token')
      const res = await fetch(`/api/assistants/${target.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      // Let the animation play for a moment before refreshing
      await new Promise((r) => setTimeout(r, 2000))
      router.refresh()
      toast.success('Agent shut down', {
        description: `${target.name} has been paused.`,
      })
    } catch (err) {
      toast.error('Failed to shut down agent', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setShuttingDownId(null)
    }
  }, [router])

  const executeResume = useCallback(async (target: { id: string; name: string }) => {
    setResumingId(target.id)
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCSRFTokenFromCookie()
      if (!csrf) throw new Error('Could not obtain CSRF token')
      const res = await fetch(`/api/assistants/${target.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      await new Promise((r) => setTimeout(r, 1200))
      router.refresh()
      toast.success('Agent resumed', {
        description: `${target.name} is back online.`,
      })
    } catch (err) {
      toast.error('Failed to resume agent', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setResumingId(null)
    }
  }, [router])

  const handleAgentSelect = useCallback(
    (agentId: string) => {
      setFocusedAgentId(agentId)
      onAgentSelect?.(agentId)
    },
    [onAgentSelect],
  )

  const handleTeamSelect = useCallback(
    (crewId: string) => {
      setFocusedAgentId(null)
      onTeamSelect?.(crewId)
    },
    [onTeamSelect],
  )

  // Inline rename handler — PATCH /api/assistants/:id with CSRF
  const handleAgentRename = useCallback(
    async (agentId: string, newName: string) => {
      try {
        await fetch('/api/auth/csrf', { credentials: 'same-origin' })
        const csrf = getCSRFTokenFromCookie()
        if (!csrf) throw new Error('Could not obtain CSRF token')
        const res = await fetch(`/api/assistants/${agentId}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ name: newName }),
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        // Optimistic update: patch the node label in-place
        setRfNodes((nodes) =>
          nodes.map((n) =>
            n.id === agentId && n.type === 'assistant'
              ? { ...n, data: { ...n.data, label: newName } }
              : n,
          ),
        )
        router.refresh()
      } catch (err) {
        console.error('[canvas] Rename agent failed:', err)
        toast.error('Failed to rename agent')
      }
    },
    [router, setRfNodes],
  )

  // Build crew member lookup (assistant_id → crew_id)
  const crewMemberLookup = useMemo(() => {
    const lookup = new Map<string, { crewId: string; isCoordinator: boolean }>()
    if (crewMembers) {
      for (const [crewId, members] of Object.entries(crewMembers)) {
        for (const m of members) {
          if (m.assistant_id) {
            lookup.set(m.assistant_id, { crewId, isCoordinator: m.is_coordinator })
          }
        }
      }
    }
    return lookup
  }, [crewMembers])

  // Ref to latest rfNodes for drag-stop (avoids recreating callback on every node change)
  const rfNodesRef = useRef(rfNodes)
  rfNodesRef.current = rfNodes
  const deployingNodeResolvedToAssistant = Boolean(
    deployingNode?.createdAgentId
    && assistants.some((assistant) => assistant.id === deployingNode.createdAgentId),
  )
  const draftLifecycleCreatedAgentId = draftAgentNode?.createdAgentId ?? null
  const draftLifecycleCreatedCrewId = draftAgentNode?.createdCrewId ?? null

  useEffect(() => {
    if (!draftLifecycleCreatedAgentId || !assistants.some((assistant) => assistant.id === draftLifecycleCreatedAgentId)) return
    const draftNode = rfNodesRef.current.find((node) => node.id === draftAgentNode?.id)
    if (!draftNode) return
    const positions = loadPositionsLocal(workspaceId)
    positions[draftLifecycleCreatedAgentId] = draftNode.position
    savePositionsLocal(workspaceId, positions)
  }, [assistants, draftAgentNode?.id, draftLifecycleCreatedAgentId, workspaceId])

  useEffect(() => {
    if (!draftLifecycleCreatedCrewId || !crews?.some((crew) => crew.id === draftLifecycleCreatedCrewId)) return
    const draftNode = rfNodesRef.current.find((node) => node.id === draftAgentNode?.id)
    if (!draftNode) return
    const positions = loadPositionsLocal(workspaceId)
    positions[`crew-${draftLifecycleCreatedCrewId}`] = draftNode.position
    savePositionsLocal(workspaceId, positions)
  }, [crews, draftAgentNode?.id, draftLifecycleCreatedCrewId, workspaceId])

  // Memoized snap grid (React Flow docs: memoize objects to avoid re-renders)
  const snapGrid = useMemo<[number, number]>(() => [20, 20], [])

  // ─── Live-fit during drag (rAF-throttled, immediate in all directions) ───
  // We are the SINGLE authority on group sizing — no expandParent fighting.
  // Snap grid (20px) prevents jitter, so no lerp needed.
  const fitRafRef = useRef<number | null>(null)
  const activeGroupRef = useRef<string | null>(null)

  const scheduleLiveFit = useCallback((groupId: string) => {
    activeGroupRef.current = groupId
    if (fitRafRef.current !== null) return // already scheduled
    fitRafRef.current = requestAnimationFrame(() => {
      fitRafRef.current = null
      const gId = activeGroupRef.current
      if (!gId) return
      // Reuse the exact fit — immediate, no lerp
      fitGroupToChildren(gId)
    })
  }, [fitGroupToChildren])

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      if (fitRafRef.current !== null) cancelAnimationFrame(fitRafRef.current)
    }
  }, [])

  // Single drag handler: schedule rAF-throttled fit (handles all 4 directions).
  // No manual left/top rebase needed — fitGroupToChildren does it all.
  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type !== 'assistant' || !reactFlowRef.current) return
      const containerNodes = rfNodesRef.current.filter((n) => n.type === 'crew' || n.type === 'canvasGroup')
      let hoverCrewId: string | null = null
      let hoverGroupId: string | null = null
      for (const containerNode of containerNodes) {
        const width = (containerNode.style?.width as number) ?? 320
        const height = (containerNode.style?.height as number) ?? 260
        if (
          node.position.x > containerNode.position.x &&
          node.position.x < containerNode.position.x + width &&
          node.position.y > containerNode.position.y &&
          node.position.y < containerNode.position.y + height
        ) {
          if (containerNode.type === 'crew') {
            hoverCrewId = containerNode.id.replace('crew-', '')
          } else {
            hoverGroupId = containerNode.id.replace('group-', '')
          }
          break
        }
      }

      setDragHoverCrewId(hoverCrewId)
      setDragHoverGroupId(hoverGroupId)

      if (!node.parentNode) return
      const currentGroupId = groupMemberLookup.get(node.id)
      if (!currentGroupId) return
      scheduleLiveFit(currentGroupId)
    },
    [groupMemberLookup, scheduleLiveFit],
  )

  // Feature 2+3: Drag-to-add / Drag-to-remove (crews + groups)
  // Groups: nodes can never be dragged out — the group expands instead
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setDragHoverCrewId(null)
      setDragHoverGroupId(null)
      if (node.type !== 'assistant' || !reactFlowRef.current) return
      const currentMembership = crewMemberLookup.get(node.id)
      const currentGroupId = groupMemberLookup.get(node.id)

      // If node is in a group, cancel any pending rAF and do one exact fit
      if (currentGroupId) {
        if (fitRafRef.current !== null) {
          cancelAnimationFrame(fitRafRef.current)
          fitRafRef.current = null
        }
        activeGroupRef.current = null
        fitGroupToChildren(currentGroupId)
        return
      }

      // Check if the node overlaps with any crew or group container node
      const containerNodes = rfNodesRef.current.filter((n) => n.type === 'crew' || n.type === 'canvasGroup')
      let targetContainer: Node | undefined
      for (const cn of containerNodes) {
        const cW = (cn.style?.width as number) ?? 320
        const cH = (cn.style?.height as number) ?? 260
        const absX = node.position.x
        const absY = node.position.y
        if (
          absX > cn.position.x &&
          absX < cn.position.x + cW &&
          absY > cn.position.y &&
          absY < cn.position.y + cH
        ) {
          targetContainer = cn
          break
        }
      }

      if (targetContainer?.type === 'crew') {
        const crewId = targetContainer.id.replace('crew-', '')
        if (currentMembership?.crewId === crewId) return
        if (currentMembership) {
          onCrewMemberRemoved?.(currentMembership.crewId, node.id)
        }
        onCrewMemberAdded?.(crewId, node.id)
      } else if (targetContainer?.type === 'canvasGroup') {
        const gId = targetContainer.id.replace('group-', '')
        if (currentMembership) onCrewMemberRemoved?.(currentMembership.crewId, node.id)
        addToGroup(gId, node.id)
      } else {
        // Dragged outside any container — only remove from crews (not groups)
        if (currentMembership) {
          onCrewMemberRemoved?.(currentMembership.crewId, node.id)
        }
      }
    },
    [crewMemberLookup, groupMemberLookup, onCrewMemberAdded, onCrewMemberRemoved, addToGroup, fitGroupToChildren, setRfNodes],
  )

  // Build topology edges from crew edges (Feature 5) + group affinity lines + data flow edges
  const buildTopologyEdges = useCallback((): Edge[] => {
    const edges: Edge[] = []

    // Crew edges
    if (crewEdges && crewMembers) {
      for (const [crewId, crewEdgeList] of Object.entries(crewEdges)) {
        const members = crewMembers[crewId] ?? []
        const memberToAssistant = new Map<string, string>()
        for (const m of members) {
          if (m.assistant_id) memberToAssistant.set(m.id, m.assistant_id)
        }
        for (const edge of crewEdgeList) {
          const sourceAssistant = memberToAssistant.get(edge.source_member_id)
          const targetAssistant = memberToAssistant.get(edge.target_member_id)
          if (!sourceAssistant || !targetAssistant) continue
          edges.push({
            id: `topo-${edge.id}`,
            source: sourceAssistant,
            target: targetAssistant,
            type: 'dataflow',
            data: { is_active: true, eventCount: 0, lastEventAt: 0 },
            markerEnd: edge.direction === 'unidirectional'
              ? { type: MarkerType.ArrowClosed, color: 'rgba(139, 92, 246, 0.4)', width: 16, height: 16 }
              : undefined,
            label: edge.label ?? undefined,
            labelStyle: { fontSize: 9, fill: 'rgba(139, 92, 246, 0.6)' },
          })
        }
      }
    }

    // Group affinity edges — faint lines between grouped agents (system feel)
    for (const group of canvasGroups) {
      const members = group.memberIds
      if (members.length < 2) continue
      // Chain: connect each member to the next (not full mesh — too noisy)
      for (let i = 0; i < members.length - 1; i++) {
        edges.push({
          id: `group-${group.id}-${members[i]}-${members[i + 1]}`,
          source: members[i],
          target: members[i + 1],
          type: 'smoothstep',
          style: { stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 },
          animated: false,
          interactionWidth: 0,
        })
      }
    }

    return edges
  }, [crewEdges, crewMembers, canvasGroups])

  // Sync topology edges when crewEdges data changes
  useEffect(() => {
    setRfEdges(buildTopologyEdges())
  }, [buildTopologyEdges, setRfEdges])

  // Build nodes array from assistants + crews + groups (layout only — no feedEvents dependency)
  const buildNodes = useCallback(
    (positions?: Record<string, { x: number; y: number }>): { nodes: Node[]; groups: LayoutGroup[] } => {
      const nodes: Node[] = []
      const groups: LayoutGroup[] = []

      // Add crew group nodes
      if (crews?.length) {
        for (const crew of crews) {
          if (draftLifecycleCreatedCrewId === crew.id && draftAgentNode) {
            continue
          }
          const members = crewMembers?.[crew.id] ?? []
          const coordinator = members.find((m) => m.is_coordinator)
          nodes.push({
            id: `crew-${crew.id}`,
            type: 'crew',
            position: positions?.[`crew-${crew.id}`] ?? crew.canvas_position ?? { x: 0, y: 0 },
            data: {
              name: crew.name,
              objective: crew.objective,
              status: crew.status,
              memberCount: members.length,
              coordinatorName: coordinator?.assistant_name ?? null,
              totalCostUsd: 0,
              onRename: onCrewRenamed,
              isRenaming: renamingCrewId === crew.id,
              isDropTarget: dragHoverCrewId === crew.id,
              onRenameComplete: () => setRenamingCrewId(null),
            } satisfies CrewNodeData,
            // Feature 7: Auto-resize crew based on member count
            // Width: 320px min, scales with member count. Height: 260px min (header + objective + footer + member space)
            style: {
              width: Math.max(320, Math.min(members.length, 4) * 280 + 40),
              minHeight: 260 + Math.ceil(members.length / 4) * 180,
            },
          })
        }
      }

      // Add user-created group nodes + register as ELK LayoutGroups
      for (const group of canvasGroups) {
        const nodeId = `group-${group.id}`
        // Reuse existing measured size to prevent jitter on re-renders.
        // Only fall back to computeGroupGrid estimate when there is no existing node.
        const existingGroupNode = rfNodesRef.current.find((n) => n.id === nodeId)
        let groupW: number, groupH: number
        if (existingGroupNode?.style?.width && existingGroupNode?.style?.height) {
          groupW = existingGroupNode.style.width as number
          groupH = existingGroupNode.style.height as number
        } else {
          const dummySizes = Array.from({ length: group.memberIds.length || 1 }, () => ({
            w: GROUP_LAYOUT.defaultChildW,
            h: GROUP_LAYOUT.defaultChildH,
          }))
          ;({ groupW, groupH } = computeGroupGrid(dummySizes))
        }
        nodes.push({
          id: nodeId,
          type: 'canvasGroup',
          position: positions?.[nodeId] ?? { x: 0, y: 0 },
          data: {
            name: group.name,
            color: group.color,
            icon: group.icon,
            onRename: renameGroup,
            onContextMenu: (gId: string) => setRightClickedGroup({ groupId: gId, name: group.name }),
            onAutoLayout: autoLayoutGroup,
            onChangeColor: changeGroupColor,
            onChangeIcon: changeGroupIcon,
            onSelectAll: selectAllInGroup,
            onPromoteToTeam: onCreateCrewFromGroup ? (groupId: string) => {
              const selectedGroup = canvasGroups.find((g) => g.id === groupId)
              if (!selectedGroup || selectedGroup.memberIds.length < 1) return
              onCreateCrewFromGroup(selectedGroup.id, selectedGroup.name, selectedGroup.memberIds)
            } : undefined,
            onDissolve: dissolveGroup,
            isRenaming: renamingGroupId === group.id,
            isDropTarget: dragHoverGroupId === group.id,
            onRenameComplete: () => setRenamingGroupId(null),
          } satisfies GroupNodeData,
          style: { width: groupW, height: groupH },
        })
        // Register as ELK compound group for auto-layout
        if (group.memberIds.length > 0) {
          groups.push({
            id: nodeId,
            children: group.memberIds,
            padding: GROUP_LAYOUT.pad,
          })
        }
      }

      // Add assistant nodes
      for (const a of assistants) {
        if (draftLifecycleCreatedAgentId === a.id && draftAgentNode) {
          continue
        }
        const status = getAgentStatus(a)
        const membership = crewMemberLookup.get(a.id)
        const groupId = groupMemberLookup.get(a.id)
        const deployingAnchorPosition =
          deployingNode?.createdAgentId === a.id
            ? positions?.[a.id]
              ?? positions?.[deployingNode.id]
              ?? rfNodesRef.current.find((node) => node.id === deployingNode.id)?.position
            : draftLifecycleCreatedAgentId === a.id && draftAgentNode
              ? positions?.[a.id]
                ?? positions?.[draftAgentNode.id]
                ?? rfNodesRef.current.find((node) => node.id === draftAgentNode.id)?.position
            : null
        const node: Node = {
          id: a.id,
          type: 'assistant',
          position: deployingAnchorPosition ?? positions?.[a.id] ?? { x: 0, y: 0 },
          data: {
            label: a.name,
            status,
            model: a.lucid_model,
            engine: a.engine ?? 'openclaw',
            systemPrompt: a.system_prompt,
            memoryEnabled: a.memory_enabled,
            walletEnabled: a.wallet_enabled,
            channels: a.assistant_channels ?? [],
            skills: [
              ...((a as unknown as Record<string, unknown>).assistant_plugin_activations as Array<{
                id: string
                is_active: boolean
                org_plugin_installations: { plugin_catalog: { slug: string } } | null
              }> | undefined ?? [])
                .filter(p => p.is_active && p.org_plugin_installations?.plugin_catalog?.slug)
                .map(p => ({ id: p.id, slug: p.org_plugin_installations!.plugin_catalog.slug })),
              ...((a as unknown as Record<string, unknown>).assistant_skill_activations as Array<{
                id: string
                is_active: boolean
                org_skill_installations: { skill_catalog: { slug: string } } | null
              }> | undefined ?? [])
                .filter(s => s.is_active && s.org_skill_installations?.skill_catalog?.slug)
                .map(s => ({ id: s.id, slug: s.org_skill_installations!.skill_catalog.slug })),
            ],
            updatedAt: a.updated_at,
            feedEvents: [], // populated by the data-sync effect below
            onSelect: handleAgentSelect,
            onNameChange: handleAgentRename,
            isCoordinator: membership?.isCoordinator,
          } satisfies AssistantNodeData,
          width: GROUP_LAYOUT.defaultChildW,
        }
        // Nest inside crew if member (crew takes priority over group)
        if (membership) {
          node.parentNode = `crew-${membership.crewId}`
          node.extent = 'parent'
        } else if (groupId) {
          node.parentNode = `group-${groupId}`
        }
        nodes.push(node)
      }

      if (deployingNode && !deployingNodeResolvedToAssistant) {
        const maxX = nodes.length > 0 ? Math.max(...nodes.map((node) => node.position.x)) : 0
        nodes.push({
          id: deployingNode.id,
          type: 'deploying',
          position: positions?.[deployingNode.id] ?? { x: maxX + 320, y: 100 },
          data: {
            label: deployingNode.label,
            status: deployingNode.phase === 'failed' ? 'paused' : 'active',
            model: 'deploying',
            engine: 'openclaw',
            channels: [],
            updatedAt: new Date(deployingNode.startedAt ?? Date.now()).toISOString(),
            feedEvents: [],
            deployment: {
              phase: deployingNode.phase,
              l2Status: deployingNode.l2Status,
              startedAt: deployingNode.startedAt,
              onRetry: deployingNode.onRetry,
              onCancel: deployingNode.onCancel,
            },
          } satisfies AssistantNodeData,
          width: GROUP_LAYOUT.defaultChildW,
          height: GROUP_LAYOUT.defaultChildH,
        })
      }

      if (draftAgentNode) {
        const maxX = nodes.length > 0 ? Math.max(...nodes.map((node) => node.position.x)) : 0
        const isDraftLifecycleNode = Boolean(
          draftAgentNode.lifecycleState
          && draftAgentNode.lifecycleState !== 'draft'
          && draftAgentNode.lifecycleState !== 'reviewing',
        )
        nodes.push({
          id: draftAgentNode.id,
          type: 'draftAgent',
          position: positions?.[draftAgentNode.id] ?? { x: maxX + 320, y: 120 },
          hidden: hideDraftAgentNode && !draftAgentNode.createdAgentId && !draftAgentNode.createdCrewId,
            data: {
              label: draftAgentNode.label,
              status: draftAgentNode.status,
              lifecycleState: draftAgentNode.lifecycleState,
              createdAgentId: draftAgentNode.createdAgentId,
              createdCrewId: draftAgentNode.createdCrewId,
            deployment: draftAgentNode.lifecycleState && draftAgentNode.lifecycleState !== 'draft' && draftAgentNode.lifecycleState !== 'reviewing'
              ? {
                  phase: draftAgentNode.lifecycleState === 'failed'
                    ? 'failed'
                    : draftAgentNode.lifecycleState === 'building'
                      ? 'deploying'
                      : 'creating',
                  startedAt: draftAgentNode.startedAt,
                }
              : undefined,
            prompt: draftAgentNode.prompt,
            promptValue: draftAgentNode.promptValue,
            isSubmitting: draftAgentNode.isSubmitting,
            featuredTemplates: draftAgentNode.featuredTemplates,
            availableUnifiedSkills: draftAgentNode.availableUnifiedSkills,
            onPromptChange: draftAgentNode.onPromptChange,
            onSubmitPrompt: draftAgentNode.onSubmitPrompt,
            onOpenBuilder: draftAgentNode.onOpenBuilder,
            onStartFresh: draftAgentNode.onStartFresh,
            onUploadSpec: draftAgentNode.onUploadSpec,
            onSelectTemplate: draftAgentNode.onSelectTemplate,
            onBrowseAllTemplates: draftAgentNode.onBrowseAllTemplates,
            onCancel: draftAgentNode.onCancel,
          } satisfies AgentBuilderDraftNodeData,
          width: isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildW : 1040,
          height: isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildH : 680,
        })
      }

      return { nodes, groups }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feedEvents excluded on purpose (see data-sync effect)
    [assistants, handleAgentSelect, handleAgentRename, crews, crewMembers, crewMemberLookup, onCrewRenamed, renamingCrewId, dragHoverCrewId, canvasGroups, groupMemberLookup, renameGroup, renamingGroupId, dragHoverGroupId, autoLayoutGroup, changeGroupColor, changeGroupIcon, selectAllInGroup, onCreateCrewFromGroup, dissolveGroup, deployingNode, deployingNodeResolvedToAssistant, draftAgentNode, hideDraftAgentNode, draftLifecycleCreatedAgentId, draftLifecycleCreatedCrewId],
  )

  // Build topology lookup for merging MC data into nodes
  const topologyLookup = useMemo(() => {
    const map = new Map<string, { healthScore: number | null; tokensTodayInput: number | null; tokensTodayOutput: number | null; errorsLastHour: number }>()
    if (topologyData?.agents) {
      for (const a of topologyData.agents) {
        map.set(a.id, { healthScore: a.healthScore, tokensTodayInput: a.tokensTodayInput, tokensTodayOutput: a.tokensTodayOutput, errorsLastHour: a.errorsLastHour })
      }
    }
    return map
  }, [topologyData])

  // Build runtime lookup (runtimeId → { provider, tier }) for provider badges
  const runtimeLookup = useMemo(() => {
    const map = new Map<string, { provider: string; tier: string | null }>()
    if (topologyData?.runtimes) {
      for (const r of topologyData.runtimes) {
        map.set(r.id, { provider: r.provider, tier: r.runtimeTier ?? null })
      }
    }
    return map
  }, [topologyData])

  // Sync live data (feedEvents, deletingId, shuttingDownId, deployingNode, topology, presence) into existing nodes
  // This runs frequently but NEVER replaces the node array — only updates data in-place
  useEffect(() => {
    setRfNodes((nodes) => {
      let updated = nodes.map((n) => {
        // Only touch assistant nodes
        if (n.type === 'assistant') {
          const topo = topologyLookup.get(n.id)
          // Derive presence from feed events for this agent
          const agentEvents = feedEvents.filter((e) => e.agent_id === n.id)
          const presenceState = derivePresenceState(agentEvents)
          // Count recent events + errors from feed events (last 5 min)
          const eventCutoff = Date.now() - 300_000
          const recentAgentEvents = agentEvents.filter((e) => new Date(e.created_at).getTime() > eventCutoff)
          const recentEventCount = recentAgentEvents.length
          const recentErrorCount = topo?.errorsLastHour ?? recentAgentEvents.filter(
            (e) => e.severity === 'error' || e.event_type === 'error',
          ).length
          // Runtime provider badge:
          // dedicated → 'lucid' (Lucid-managed)
          // byo → actual infra provider (railway, akash, etc.)
          const assistant = assistants.find((a) => a.id === n.id)
          const rtInfo = assistant?.runtime_id ? runtimeLookup.get(assistant.runtime_id) : null
          const runtimeProvider = !assistant?.runtime_id ? null
            : rtInfo?.tier === 'byo' ? rtInfo.provider
            : 'lucid'
          const nextData = {
            ...n.data,
            feedEvents: agentEvents,
            isDeleting: n.id === deletingId,
            isShuttingDown: n.id === shuttingDownId,
            isResuming: n.id === resumingId,
            // MC monitoring data
            healthScore: topo?.healthScore ?? n.data.healthScore,
            tokensTodayInput: topo?.tokensTodayInput ?? n.data.tokensTodayInput,
            tokensTodayOutput: topo?.tokensTodayOutput ?? n.data.tokensTodayOutput,
            presenceState,
            recentEventCount,
            recentErrorCount,
            runtimeProvider,
          }
          if (
            n.data.isDeleting === nextData.isDeleting
            && n.data.isShuttingDown === nextData.isShuttingDown
            && n.data.isResuming === nextData.isResuming
            && n.data.healthScore === nextData.healthScore
            && n.data.tokensTodayInput === nextData.tokensTodayInput
            && n.data.tokensTodayOutput === nextData.tokensTodayOutput
            && n.data.presenceState === nextData.presenceState
            && n.data.recentEventCount === nextData.recentEventCount
            && n.data.recentErrorCount === nextData.recentErrorCount
            && n.data.runtimeProvider === nextData.runtimeProvider
            && feedEventSignature(n.data.feedEvents as FeedEvent[]) === feedEventSignature(agentEvents)
          ) {
            return n
          }
          return {
            ...n,
            data: nextData,
          }
        }
        // Update deploying node phase/callbacks/l2Status
        if (n.type === 'deploying' && deployingNode && n.id === deployingNode.id) {
          return {
            ...n,
            data: {
              ...(n.data as AssistantNodeData),
              label: deployingNode.label,
              status: deployingNode.phase === 'failed' ? 'paused' : 'active',
              updatedAt: new Date(deployingNode.startedAt ?? Date.now()).toISOString(),
              deployment: {
                phase: deployingNode.phase,
                l2Status: deployingNode.l2Status,
                startedAt: deployingNode.startedAt,
                onRetry: deployingNode.onRetry,
                onCancel: deployingNode.onCancel,
              },
            },
          }
        }
        if (n.type === 'draftAgent' && draftAgentNode && n.id === draftAgentNode.id) {
          return {
            ...n,
            hidden: hideDraftAgentNode && !draftAgentNode.createdAgentId && !draftAgentNode.createdCrewId,
            data: {
              ...(n.data as AgentBuilderDraftNodeData),
              label: draftAgentNode.label,
              status: draftAgentNode.status,
              lifecycleState: draftAgentNode.lifecycleState,
              createdAgentId: draftAgentNode.createdAgentId,
              createdCrewId: draftAgentNode.createdCrewId,
              deployment: draftAgentNode.lifecycleState && draftAgentNode.lifecycleState !== 'draft' && draftAgentNode.lifecycleState !== 'reviewing'
                ? {
                    phase: draftAgentNode.lifecycleState === 'failed'
                      ? 'failed'
                      : draftAgentNode.lifecycleState === 'building'
                        ? 'deploying'
                        : 'creating',
                    startedAt: draftAgentNode.startedAt,
                  }
                : undefined,
              prompt: draftAgentNode.prompt,
              promptValue: draftAgentNode.promptValue,
              isSubmitting: draftAgentNode.isSubmitting,
              featuredTemplates: draftAgentNode.featuredTemplates,
              availableUnifiedSkills: draftAgentNode.availableUnifiedSkills,
              onPromptChange: draftAgentNode.onPromptChange,
              onSubmitPrompt: draftAgentNode.onSubmitPrompt,
              onOpenBuilder: draftAgentNode.onOpenBuilder,
              onStartFresh: draftAgentNode.onStartFresh,
              onUploadSpec: draftAgentNode.onUploadSpec,
              onSelectTemplate: draftAgentNode.onSelectTemplate,
              onBrowseAllTemplates: draftAgentNode.onBrowseAllTemplates,
              onCancel: draftAgentNode.onCancel,
            },
          }
        }
        return n
      })

      if (draftAgentNode && !updated.find((n) => n.id === draftAgentNode.id)) {
        const maxX = updated.length > 0 ? Math.max(...updated.map((n) => n.position.x)) : 0
        const isDraftLifecycleNode = Boolean(
          draftAgentNode.lifecycleState
          && draftAgentNode.lifecycleState !== 'draft'
          && draftAgentNode.lifecycleState !== 'reviewing',
        )
        updated = [...updated, {
          id: draftAgentNode.id,
          type: 'draftAgent',
          position: { x: maxX + 320, y: 120 },
          hidden: hideDraftAgentNode && !draftAgentNode.createdAgentId && !draftAgentNode.createdCrewId,
          data: {
            label: draftAgentNode.label,
            status: draftAgentNode.status,
            lifecycleState: draftAgentNode.lifecycleState,
            createdAgentId: draftAgentNode.createdAgentId,
            createdCrewId: draftAgentNode.createdCrewId,
            deployment: draftAgentNode.lifecycleState && draftAgentNode.lifecycleState !== 'draft' && draftAgentNode.lifecycleState !== 'reviewing'
              ? {
                  phase: draftAgentNode.lifecycleState === 'failed'
                    ? 'failed'
                    : draftAgentNode.lifecycleState === 'building'
                      ? 'deploying'
                      : 'creating',
                  startedAt: draftAgentNode.startedAt,
                }
              : undefined,
            prompt: draftAgentNode.prompt,
            promptValue: draftAgentNode.promptValue,
            isSubmitting: draftAgentNode.isSubmitting,
            featuredTemplates: draftAgentNode.featuredTemplates,
            availableUnifiedSkills: draftAgentNode.availableUnifiedSkills,
            onPromptChange: draftAgentNode.onPromptChange,
            onSubmitPrompt: draftAgentNode.onSubmitPrompt,
            onOpenBuilder: draftAgentNode.onOpenBuilder,
            onStartFresh: draftAgentNode.onStartFresh,
            onUploadSpec: draftAgentNode.onUploadSpec,
            onSelectTemplate: draftAgentNode.onSelectTemplate,
            onBrowseAllTemplates: draftAgentNode.onBrowseAllTemplates,
            onCancel: draftAgentNode.onCancel,
          } satisfies AgentBuilderDraftNodeData,
          width: isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildW : 1040,
          height: isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildH : 680,
        }]
        setTimeout(() => {
          reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
        }, 100)
      }

      // Remove deploying node if cleared
      if (!deployingNode || deployingNodeResolvedToAssistant) {
        updated = updated.filter((n) => n.type !== 'deploying')
      }
      if (!draftAgentNode) {
        updated = updated.filter((n) => n.type !== 'draftAgent')
      }

      return updated
    })
  }, [feedEvents, deletingId, shuttingDownId, resumingId, deployingNode, deployingNodeResolvedToAssistant, draftAgentNode, hideDraftAgentNode, setRfNodes, topologyLookup, runtimeLookup, assistants])

  // ─── Sync live event data into crew edges (particles + pulse) ───
  useEffect(() => {
    if (!feedEvents.length) return
    const eventCutoff = Date.now() - 300_000
    setRfEdges((edges) => {
      let changed = false
      const updated = edges.map((e) => {
        if (e.type !== 'dataflow') return e
        // Count events where source agent sent to target agent in last 5 min
        const relevantEvents = feedEvents.filter(
          (ev) =>
            (ev.agent_id === e.source || ev.agent_id === e.target) &&
            new Date(ev.created_at).getTime() > eventCutoff,
        )
        const eventCount = relevantEvents.length
        const lastEventAt = relevantEvents.length > 0
          ? Math.max(...relevantEvents.map((ev) => new Date(ev.created_at).getTime()))
          : 0
        if (e.data?.eventCount === eventCount && e.data?.lastEventAt === lastEventAt) return e
        changed = true
        return { ...e, data: { ...e.data, is_active: true, eventCount, lastEventAt } }
      })
      return changed ? updated : edges
    })
  }, [feedEvents, setRfEdges])

  // ─── Focus halo: dim unrelated nodes/edges when an agent is focused ───
  // Compute the set of connected node IDs from edges (memoized ref to avoid re-renders)
  const focusConnectedRef = useRef<{ nodeIds: Set<string>; edgeIds: Set<string> }>({ nodeIds: new Set(), edgeIds: new Set() })

  useEffect(() => {
    if (!focusedAgentId) {
      focusConnectedRef.current = { nodeIds: new Set(), edgeIds: new Set() }

      // Clear all focus styles from nodes (skip group nodes — never touch their style)
      setRfNodes((nodes) => {
        let changed = false
        const cleared = nodes.map((n) => {
          if (n.type === 'canvasGroup') return n
          const hasFocusOpacity = n.style?.opacity !== undefined
          const hasFocusFlag = n.type === 'assistant' && n.data?.isFocused
          if (!hasFocusOpacity && !hasFocusFlag) return n
          changed = true
          const { opacity: _o, transition: _t, ...restStyle } = (n.style ?? {}) as Record<string, unknown>
          return {
            ...n,
            style: Object.keys(restStyle).length > 0 ? (restStyle as React.CSSProperties) : undefined,
            data: n.type === 'assistant' ? { ...n.data, isFocused: false } : n.data,
          } as Node
        })
        return changed ? cleared : nodes
      })

      // Clear all focus styles from edges
      setRfEdges((edges) => {
        let changed = false
        const cleared = edges.map((e) => {
          if (e.style?.opacity === undefined) return e
          changed = true
          const { opacity: _o, transition: _t, ...restStyle } = (e.style ?? {}) as Record<string, unknown>
          return { ...e, style: Object.keys(restStyle).length > 0 ? (restStyle as React.CSSProperties) : undefined } as Edge
        })
        return changed ? cleared : edges
      })
      return
    }

    // First pass: compute connected edges and nodes from current edges
    setRfEdges((edges) => {
      const connectedEdgeIds = new Set<string>()
      const connectedNodeIds = new Set<string>([focusedAgentId])

      for (const edge of edges) {
        if (edge.source === focusedAgentId || edge.target === focusedAgentId) {
          connectedEdgeIds.add(edge.id)
          connectedNodeIds.add(edge.source)
          connectedNodeIds.add(edge.target)
        }
      }

      focusConnectedRef.current = { nodeIds: connectedNodeIds, edgeIds: connectedEdgeIds }

      // Dim unrelated edges
      return edges.map((e) => {
        if (connectedEdgeIds.has(e.id)) {
          const { opacity: _o, transition: _t, ...restStyle } = (e.style ?? {}) as Record<string, unknown>
          return { ...e, style: { ...(restStyle as React.CSSProperties), transition: 'opacity 200ms ease' } } as Edge
        }
        return { ...e, style: { ...e.style, opacity: 0.15, transition: 'opacity 200ms ease' } }
      })
    })

    // Second pass: dim unrelated nodes, mark focused node, include parent runtime
    setRfNodes((nodes) => {
      const { nodeIds: connectedNodeIds } = focusConnectedRef.current
      // Also include parent runtime node
      const focusedNode = nodes.find((n) => n.id === focusedAgentId)
      if (focusedNode?.parentNode) {
        connectedNodeIds.add(focusedNode.parentNode)
      }

      return nodes.map((n) => {
        // Never touch group node styles — prevents resize jitter
        if (n.type === 'canvasGroup') return n
        if (n.id === focusedAgentId) {
          return {
            ...n,
            data: { ...n.data, isFocused: true },
            style: { ...n.style, transition: 'opacity 200ms ease' },
          }
        }
        if (connectedNodeIds.has(n.id)) {
          return { ...n, style: { ...n.style, transition: 'opacity 200ms ease' } }
        }
        return {
          ...n,
          style: { ...n.style, opacity: 0.3, transition: 'opacity 200ms ease' },
          data: n.type === 'assistant' ? { ...n.data, isFocused: false } : n.data,
        }
      })
    })
  }, [focusedAgentId, setRfNodes, setRfEdges])

  // Debounced position save on drag
  const wrappedOnNodesChange = useCallback(
    (changes: import('reactflow').NodeChange[]) => {
      // Snapshot before drag starts
      const hasDragStart = changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging)
      if (hasDragStart) {
        setRfNodes((nodes) => {
          pushSnapshot(nodes)
          return nodes
        })
      }

      onNodesChange(changes)

      // Save positions when dragging ends
      const hasDragEnd = changes.some((c) => c.type === 'position' && !('dragging' in c && c.dragging))
      if (hasDragEnd) {
        if (dragTimerRef.current) clearTimeout(dragTimerRef.current)
        dragTimerRef.current = setTimeout(() => {
          setRfNodes((nodes) => {
            savePositions(nodes)
            return nodes
          })
        }, 200)
      }
    },
    [onNodesChange, setRfNodes, pushSnapshot],
  )

  // Auto-layout action (preserves deploying nodes)
  const handleAutoLayout = useCallback(() => {
    if (layouting || assistants.length === 0) return
    setRfNodes((current) => { pushSnapshot(current); return current })
    setLayouting(true)
    const { nodes, groups } = buildNodes()
    const layoutEdges = buildTopologyEdges()

    // Merge DOM-measured dimensions into freshly-built nodes so ELK uses accurate sizes
    mergeDOMMeasurements(nodes, reactFlowRef)

    autoLayoutNodes(nodes, layoutEdges, {
      direction: 'RIGHT',
      nodeSpacing: 10,
      layerSpacing: 30,
    }, groups.length > 0 ? groups : undefined).then((positioned) => {
      // Re-apply parentNode on grouped children (ELK positions are already parent-relative)
      const groupChildMap = new Map<string, string>()
      for (const g of canvasGroups) {
        for (const mid of g.memberIds) {
          groupChildMap.set(mid, `group-${g.id}`)
        }
      }
      const final = positioned.map((n) => {
        const parentId = groupChildMap.get(n.id)
        if (parentId) {
          return { ...n, parentNode: parentId }
        }
        return n
      })

      setRfNodes((current) => preserveLiveNodeData(final, current))
      if (!deployingNode) savePositions(final)
      setLayouting(false)
      // Fit group sizing after layout positions settle
      for (const g of canvasGroups) {
        if (g.memberIds.length > 0) fitGroupToChildren(g.id)
      }
      setTimeout(() => {
        reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
      }, 50)
    })
  }, [layouting, assistants.length, buildNodes, buildTopologyEdges, setRfNodes, pushSnapshot, canvasGroups, fitGroupToChildren, deployingNode])

  // Fit view action
  const handleFitView = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
  }, [])

  // Reset positions (clear saved, re-layout)
  const handleResetPositions = useCallback(() => {
    try { localStorage.removeItem(positionsKey(workspaceId)) } catch { /* ignore */ }
    savePositions([]) // clear DB positions too
    handleAutoLayout()
  }, [handleAutoLayout, workspaceId, savePositions])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusedAgentId(null)
        return
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'l' || e.key === 'L') {
          e.preventDefault()
          handleAutoLayout()
        }
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleAutoLayout, undo, redo])

  // Initial layout — only runs when the assistants array or topology actually changes
  // Preserves deploying nodes across re-renders
  useEffect(() => {
    // Skip re-layout when group operations (add/remove/rename/dissolve) caused the trigger
    if (skipLayoutRef.current > 0) {
      skipLayoutRef.current--
      return
    }

    if (assistants.length === 0) {
      if (deployingNode || draftAgentNode) {
        const { nodes } = buildNodes()
        setRfNodes(nodes)
        setRfEdges([])
        setLayoutReady(true)
        requestAnimationFrame(() => {
          reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
        })
        return
      }
      setRfNodes([])
      setLayoutReady(true)
      return
    }

    const savedPositions = loadPositionsLocal(workspaceId)
    if (deployingNodeResolvedToAssistant) {
      const { nodes } = buildNodes(savedPositions)
      setRfNodes(nodes)
      setRfEdges(buildTopologyEdges())
      setLayoutReady(true)
      savePositions(nodes)
      return
    }

    const allHaveSavedPositions = assistants.every((a) => savedPositions[a.id])

    if (allHaveSavedPositions && !deployingNode) {
      const { nodes: allNodes } = buildNodes(savedPositions)
      setRfNodes((prev) => {
        const deploying = prev.filter((n) => n.type === 'deploying')
        const nextNodes = deploying.length > 0
          ? allNodes.filter((n) => n.type !== 'deploying')
          : allNodes
        return [...nextNodes, ...deploying]
      })
      setRfEdges(buildTopologyEdges())
      setLayoutReady(true)
      // Double-RAF: let React commit + ReactFlow measure, then batch-fit all groups in one setRfNodes
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const groupsToFit = canvasGroups.filter((g) => g.memberIds.length > 0)
        if (groupsToFit.length > 0) {
          setRfNodes((nodes) => {
            let updated = nodes
            for (const g of groupsToFit) {
              const parentId = `group-${g.id}`
              const parent = updated.find((n) => n.id === parentId)
              if (!parent) continue
              const children = updated.filter((n) => n.parentNode === parentId)
              const fit = computeFitToChildren(parent, children)
              if (!fit) continue
              updated = updated.map((n) => {
                if (n.id === parentId) {
                  return { ...n, position: { x: n.position.x + fit.parentDelta.dx, y: n.position.y + fit.parentDelta.dy }, style: { ...n.style, width: fit.newW, height: fit.newH } }
                }
                if (n.parentNode === parentId) {
                  return { ...n, position: { x: n.position.x + fit.childDelta.dx, y: n.position.y + fit.childDelta.dy } }
                }
                return n
              })
            }
            return updated
          })
        }
        reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
      }))
    } else {
      const { nodes, groups } = buildNodes()
      const layoutEdges = buildTopologyEdges()

      // Merge DOM-measured dimensions into freshly-built nodes so ELK uses accurate sizes
      mergeDOMMeasurements(nodes, reactFlowRef)

      autoLayoutNodes(nodes, layoutEdges, {
        direction: 'RIGHT',
        nodeSpacing: 10,
        layerSpacing: 30,
      }, groups.length > 0 ? groups : undefined).then((positioned) => {
        // Re-apply parentNode on grouped children
        const groupChildMap = new Map<string, string>()
        for (const g of canvasGroups) {
          for (const mid of g.memberIds) {
            groupChildMap.set(mid, `group-${g.id}`)
          }
        }
        const final = positioned.map((n) => {
          const parentId = groupChildMap.get(n.id)
          if (parentId) return { ...n, parentNode: parentId }
          return n
        })
        setRfNodes((prev) => {
          const deploying = prev.filter((n) => n.type === 'deploying')
          const nextNodes = deploying.length > 0
            ? final.filter((n) => n.type !== 'deploying')
            : final
          return [...nextNodes, ...deploying]
        })
        setRfEdges(layoutEdges)
        setLayoutReady(true)
        if (!deployingNode) savePositions(final)
        // Double-RAF: let React commit + ReactFlow measure, then batch-fit all groups
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const groupsToFit = canvasGroups.filter((g) => g.memberIds.length > 0)
          if (groupsToFit.length > 0) {
            setRfNodes((nodes) => {
              let updated = nodes
              for (const g of groupsToFit) {
                const parentId = `group-${g.id}`
                const parent = updated.find((n) => n.id === parentId)
                if (!parent) continue
                const children = updated.filter((n) => n.parentNode === parentId)
                const fit = computeFitToChildren(parent, children)
                if (!fit) continue
                updated = updated.map((n) => {
                  if (n.id === parentId) {
                    return { ...n, position: { x: n.position.x + fit.parentDelta.dx, y: n.position.y + fit.parentDelta.dy }, style: { ...n.style, width: fit.newW, height: fit.newH } }
                  }
                  if (n.parentNode === parentId) {
                    return { ...n, position: { x: n.position.x + fit.childDelta.dx, y: n.position.y + fit.childDelta.dy } }
                  }
                  return n
                })
              }
              return updated
            })
          }
          reactFlowRef.current?.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
        }))
      })
    }
  }, [assistants, buildTopologyEdges, setRfNodes, setRfEdges, canvasGroups, deployingNode?.id, deployingNodeResolvedToAssistant, draftAgentNode?.id, workspaceId])

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance
    instance.fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
  }, [])

  useEffect(() => {
    if (!layoutReady) return
    onReady?.()
  }, [layoutReady, onReady])

  useEffect(() => {
    if (!initialFocusAgentId || appliedInitialFocusRef.current === initialFocusAgentId) return

    const targetNode = rfNodes.find((node) => node.id === initialFocusAgentId)
    if (!targetNode) return

    appliedInitialFocusRef.current = initialFocusAgentId
    setFocusedAgentId(initialFocusAgentId)
    setRfNodes((nodes) => nodes.map((node) => ({
      ...node,
      selected: node.id === initialFocusAgentId,
    })))

    requestAnimationFrame(() => {
      reactFlowRef.current?.setCenter(
        targetNode.position.x + (Number(targetNode.width) || 220) / 2,
        targetNode.position.y + (Number(targetNode.height) || 140) / 2,
        { zoom: 1, duration: 450 },
      )
    })
  }, [initialFocusAgentId, rfNodes, setRfNodes])

  useEffect(() => {
    if (!initialFocusTeamId || appliedInitialFocusRef.current === `team:${initialFocusTeamId}`) return

    const targetNode = rfNodes.find((node) => node.id === `crew-${initialFocusTeamId}`)
    if (!targetNode) return

    appliedInitialFocusRef.current = `team:${initialFocusTeamId}`
    setFocusedAgentId(null)
    setRfNodes((nodes) => nodes.map((node) => ({
      ...node,
      selected: node.id === `crew-${initialFocusTeamId}`,
    })))

    requestAnimationFrame(() => {
      reactFlowRef.current?.setCenter(
        targetNode.position.x + (Number(targetNode.width) || 320) / 2,
        targetNode.position.y + (Number(targetNode.height) || 260) / 2,
        { zoom: 1, duration: 450 },
      )
    })
  }, [initialFocusTeamId, rfNodes, setRfNodes])

  useEffect(() => {
    if (!draftAgentNode?.id || !draftAgentNode.focusVersion) return
    const focusKey = `${draftAgentNode.id}:${draftAgentNode.focusVersion}`
    if (appliedDraftFocusRef.current === focusKey) return
    const targetNode = rfNodes.find((node) => node.id === draftAgentNode.id)
    if (!targetNode) return

    appliedDraftFocusRef.current = focusKey
    setRfNodes((nodes) => nodes.map((node) => ({
      ...node,
      selected: node.id === draftAgentNode.id,
    })))

    requestAnimationFrame(() => {
      const isDraftLifecycleNode = Boolean(
        draftAgentNode.lifecycleState
        && draftAgentNode.lifecycleState !== 'draft'
        && draftAgentNode.lifecycleState !== 'reviewing',
      )
      const fallbackWidth = isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildW : 1040
      const fallbackHeight = isDraftLifecycleNode ? GROUP_LAYOUT.defaultChildH : 680
      reactFlowRef.current?.setCenter(
        targetNode.position.x + (Number(targetNode.width) || fallbackWidth) / 2,
        targetNode.position.y + (Number(targetNode.height) || fallbackHeight) / 2,
        { zoom: 1, duration: 350 },
      )
    })
  }, [draftAgentNode?.focusVersion, draftAgentNode?.id, draftAgentNode?.lifecycleState, rfNodes, setRfNodes])

  if (!layoutReady) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <img src="/lucid_w.gif" alt="Loading" className="h-10 w-10 opacity-60 dark:invert-0 invert" />
        <p className="text-base font-medium text-muted-foreground/60 animate-pulse">Waking up the fleet...</p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-background">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="h-full w-full">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={wrappedOnNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={canvasNodeTypes}
              edgeTypes={canvasEdgeTypes}
              onInit={handleInit}
              onNodeClick={(_event, node) => {
                if (node.type === 'assistant') {
                  setFocusedAgentId(node.id)
                  onAgentSelect?.(node.id)
                  onGroupSelect?.(null)
                  return
                }

                if (node.type === 'crew') {
                  const crewId = node.id.replace('crew-', '')
                  handleTeamSelect(crewId)
                  onGroupSelect?.(null)
                  return
                }

                if (node.type === 'canvasGroup') {
                  const groupId = node.id.replace('group-', '')
                  const selectedGroup = canvasGroups.find((group) => group.id === groupId) ?? null
                  onGroupSelect?.(selectedGroup ? {
                    id: selectedGroup.id,
                    name: selectedGroup.name,
                    memberIds: selectedGroup.memberIds,
                  } : null)
                  return
                }
              }}
              onPaneClick={() => {
                setFocusedAgentId(null)
                setDragHoverCrewId(null)
                setDragHoverGroupId(null)
                onGroupSelect?.(null)
                onPaneClick?.()
              }}
              onNodeDrag={handleNodeDrag}
              onNodeDragStop={handleNodeDragStop}
              onSelectionChange={onSelectionChange}
              onNodeContextMenu={(_event, node) => {
                // Crew node context menu (Feature 6)
                if (node.type === 'crew') {
                  const data = node.data as CrewNodeData
                  const crewId = node.id.replace('crew-', '')
                  flushSync(() => {
                    setRightClickedCrew({ crewId, name: data.name })
                    setRightClickedNode(null)
                    setRightClickedGroup(null)
                  })
                  return
                }
                // Group node context menu
                if (node.type === 'canvasGroup') {
                  const data = node.data as GroupNodeData
                  const gId = node.id.replace('group-', '')
                  flushSync(() => {
                    setRightClickedGroup({ groupId: gId, name: data.name })
                    setRightClickedNode(null)
                    setRightClickedCrew(null)
                  })
                  return
                }
                const data = node.data as AssistantNodeData
                const assistant = assistants.find((a) => a.id === node.id)
                flushSync(() => {
                  setRightClickedNode({ id: node.id, label: data.label, isActive: assistant?.is_active ?? true })
                  setRightClickedCrew(null)
                  setRightClickedGroup(null)
                })
              }}
              onPaneContextMenu={() => {
                flushSync(() => {
                  setRightClickedNode(null)
                  setRightClickedCrew(null)
                  setRightClickedGroup(null)
                })
              }}
              fitView
              minZoom={0.2}
              maxZoom={2}
              snapToGrid
              snapGrid={snapGrid}
              nodeDragThreshold={2}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              panOnScroll
              selectionOnDrag={false}
              multiSelectionKeyCode="Shift"
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <CanvasGridSurface />

              {/* Empty state */}
              {assistants.length === 0 && !deployingNode && !draftAgentNode && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-4 pointer-events-auto text-center">
                    <div className="rounded-full border border-border p-4">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                      <div>
                        <h2 className="text-sm font-medium text-foreground">Your agent fleet starts here</h2>
                        <p className="text-[13px] text-muted-foreground mt-1 max-w-xs">
                          Launch your first agent and connect it to Telegram, Discord, Slack, or the web.
                        </p>
                      </div>
                    {onAddAgent && (
                      <button
                        onClick={onAddAgent}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-150"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create agent
                      </button>
                    )}
                  </div>
                </div>
              )}
            </ReactFlow>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          {/* Node-specific items (shown when right-clicking on an agent node) */}
          {rightClickedNode && (
            <>
              <ContextMenuItem onSelect={() => onAgentSelect?.(rightClickedNode.id)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                <span>View Details</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => {
                navigator.clipboard.writeText(rightClickedNode.id)
                toast.success('Agent ID copied')
              }}>
                <Copy className="mr-2 h-4 w-4" />
                <span>Copy Agent ID</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              {rightClickedNode.isActive ? (
                <ContextMenuItem
                  className="text-amber-500 focus:text-amber-500 focus:bg-amber-500/10"
                  onSelect={() => executeShutdown({ id: rightClickedNode.id, name: rightClickedNode.label })}
                >
                  <PowerOff className="mr-2 h-4 w-4" />
                  <span>Shut Down Agent</span>
                </ContextMenuItem>
              ) : (
                <ContextMenuItem
                  className="text-emerald-500 focus:text-emerald-500 focus:bg-emerald-500/10"
                  onSelect={() => executeResume({ id: rightClickedNode.id, name: rightClickedNode.label })}
                >
                  <Power className="mr-2 h-4 w-4" />
                  <span>Resume Agent</span>
                </ContextMenuItem>
              )}
              <ContextMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onSelect={() => setDeleteTarget({ id: rightClickedNode.id, name: rightClickedNode.label })}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Agent</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              {/* Group submenu — Railway-style grouping */}
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Group</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onSelect={() => {
                    const name = prompt('Group name:')
                    if (name?.trim()) {
                      createGroup(name.trim(), rightClickedNode.id)
                    }
                  }}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    <span>Create a group</span>
                  </ContextMenuItem>
                  {canvasGroups.length > 0 && <ContextMenuSeparator />}
                  {canvasGroups.map((g) => {
                    const isInThisGroup = groupMemberLookup.get(rightClickedNode.id) === g.id
                    return (
                      <ContextMenuItem
                        key={g.id}
                        disabled={isInThisGroup}
                        onSelect={() => {
                          if (!isInThisGroup) {
                            addToGroup(g.id, rightClickedNode.id)
                            toast.success(`Added to "${g.name}"`)
                          }
                        }}
                      >
                        <span
                          className="mr-2 h-3 w-3 rounded-full flex-shrink-0 inline-block"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="truncate flex-1">{g.name}</span>
                        {isInThisGroup && <Check className="ml-auto h-3.5 w-3.5 text-emerald-400" />}
                      </ContextMenuItem>
                    )
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          )}

          {/* Group node context menu */}
          {rightClickedGroup && (
            <>
              <ContextMenuItem onSelect={() => setRenamingGroupId(rightClickedGroup.groupId)}>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Rename Group</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => autoLayoutGroup(rightClickedGroup.groupId)}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                <span>Auto Layout Group</span>
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Palette className="mr-2 h-4 w-4" />
                  <span>Change Color</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-36">
                  {GROUP_COLORS.map((color) => {
                    const currentColor = canvasGroups.find((g) => g.id === rightClickedGroup.groupId)?.color
                    return (
                      <ContextMenuItem
                        key={color}
                        onSelect={() => changeGroupColor(rightClickedGroup.groupId, color)}
                      >
                        <span
                          className="mr-2 h-3 w-3 rounded-full flex-shrink-0 inline-block"
                          style={{ backgroundColor: color }}
                        />
                        <span>{GROUP_COLOR_LABELS[color] ?? color}</span>
                        {currentColor === color && <Check className="ml-auto h-3 w-3 text-muted-foreground" />}
                      </ContextMenuItem>
                    )
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onSelect={() => selectAllInGroup(rightClickedGroup.groupId)}>
                <BoxSelect className="mr-2 h-4 w-4" />
                <span>Select All in Group</span>
              </ContextMenuItem>
              {(() => {
                const selectedGroup = canvasGroups.find((g) => g.id === rightClickedGroup.groupId)
                if (!selectedGroup || selectedGroup.memberIds.length < 1 || !onCreateCrewFromGroup) {
                  return null
                }

                return (
                  <ContextMenuItem
                    onSelect={() =>
                      onCreateCrewFromGroup(
                        selectedGroup.id,
                        selectedGroup.name,
                        selectedGroup.memberIds,
                      )
                    }
                  >
                    <Users className="mr-2 h-4 w-4" />
                    <span>Convert to Team</span>
                  </ContextMenuItem>
                )
              })()}
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onSelect={() => dissolveGroup(rightClickedGroup.groupId)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                <span>Dissolve Group</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          {/* Team node context menu */}
          {rightClickedCrew && (
            <>
              <ContextMenuItem onSelect={() => setRenamingCrewId(rightClickedCrew.crewId)}>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Rename Team</span>
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onSelect={() => onCrewDissolved?.(rightClickedCrew.crewId)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                <span>Dissolve Team</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}



          {/* Multi-select → Create Crew (Feature 1) */}
          {selectedAssistantIds.length >= 2 && onCreateCrewFromSelection && (
            <>
              <ContextMenuItem onSelect={() => onCreateCrewFromSelection(selectedAssistantIds)}>
                <Users className="mr-2 h-4 w-4" />
                <span>Create Team from Selection ({selectedAssistantIds.length})</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          {onCreateCrew && (
            <>
              <ContextMenuItem onSelect={onCreateCrew}>
                <Users className="mr-2 h-4 w-4" />
                <span>Create Team</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          <ContextMenuItem onSelect={onAddAgent}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Add Agent</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={handleAutoLayout} disabled={layouting || assistants.length === 0}>
            {layouting ? (
              <Network className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Network className="mr-2 h-4 w-4" />
            )}
            <span>Auto Layout</span>
            <ContextMenuShortcut>⌘L</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuItem onSelect={handleFitView}>
            <Maximize2 className="mr-2 h-4 w-4" />
            <span>Fit to View</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={undo} disabled={!canUndo}>
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Undo</span>
            <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuItem onSelect={redo} disabled={!canRedo}>
            <Redo2 className="mr-2 h-4 w-4" />
            <span>Redo</span>
            <ContextMenuShortcut>⌘⇧Z</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={handleResetPositions}>
            <RotateCcw className="mr-2 h-4 w-4" />
            <span>Reset Positions</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Unified bottom-left toolbar: zoom, fit, undo, redo */}
      <CanvasToolbar
        onFitView={handleFitView}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Inspector panel removed — AssistantPreviewPanel in list-client handles this */}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and all its data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault() // prevent Radix auto-close race
                if (deleteTarget) executeDelete(deleteTarget)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function AssistantsCanvas(props: {
  assistants: Assistant[]
  workspaceSlug: string
  workspaceId: string
  feedEvents: FeedEvent[]
  onAgentSelect?: (agentId: string) => void
  onTeamSelect?: (crewId: string) => void
  onGroupSelect?: (group: { id: string; name: string; memberIds: string[] } | null) => void
  onAddAgent?: () => void
  onPaneClick?: () => void
  initialFocusAgentId?: string | null
  initialFocusTeamId?: string | null
  deployingNode?: CanvasDeployingNode | null
  draftAgentNode?: ({ id: string; focusVersion?: number } & AgentBuilderDraftNodeData) | null
  hideDraftAgentNode?: boolean
  replaceGroupRequest?: { groupId: string; nonce: number } | null
  onReplaceGroupHandled?: () => void
  crews?: Crew[]
  crewMembers?: Record<string, CrewMember[]>
  crewEdges?: Record<string, CrewEdge[]>
  onCreateCrewFromSelection?: (assistantIds: string[]) => void
  onCreateCrewFromGroup?: (groupId: string, name: string, assistantIds: string[]) => void
  onCreateCrew?: () => void
  onCrewMemberAdded?: (crewId: string, assistantId: string) => void
  onCrewMemberRemoved?: (crewId: string, assistantId: string) => void
  onCrewRenamed?: (crewId: string, name: string) => void
  onCrewDissolved?: (crewId: string) => void
  topologyData?: CanvasTopologyData
  onReady?: () => void
}) {
  return (
    <ReactFlowProvider>
      <AssistantsCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

export const AgentsCanvas = AssistantsCanvas
