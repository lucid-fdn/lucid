'use client';

import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  BackgroundVariant,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes } from '../nodes';
import { edgeTypes } from '../edges';
import { AutoLayout } from '../auto-layout';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Save, Network, Loader2 } from 'lucide-react';

// Store callback at module AND window level (React Flow can't serialize functions in node data)
let _globalOnAddNode: ((context?: string, nodeId?: string) => void) | null = null;

interface WorkflowCanvasProps {
  onAddNode?: () => void;
  onLayoutTrigger?: (trigger: () => Promise<boolean>) => void;
  onSave?: () => void;
  onAutoLayout?: () => void;
  onFitView?: (fitView: () => void) => void;
  onScreenToFlowPosition?: (fn: (pos: { x: number; y: number }) => { x: number; y: number }) => void;
  saving?: boolean;
  layouting?: boolean;
  hasUnsavedChanges?: boolean;
  nodesLength?: number;
}

export function WorkflowCanvas({ 
  onAddNode,
  onLayoutTrigger: _onLayoutTrigger,
  onSave,
  onAutoLayout,
  onFitView,
  onScreenToFlowPosition,
  saving = false,
  layouting = false,
  hasUnsavedChanges = false,
  nodesLength = 0
}: WorkflowCanvasProps = {}) {
  const { 
    nodes: storeNodes, 
    edges: storeEdges, 
    addEdge: storeAddEdge, 
    setNodes: storeSetNodes, 
    setEdges: storeSetEdges,
    deleteNode,
    deleteEdge,
    setSelectedNode,
    selectedNodeId
  } = useCanvasStore();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Store onAddNode in module-level AND window variable (React Flow serialization workaround)
  useEffect(() => {
    // Wrap onAddNode to support context (before/after a node) and handleContext (model/memory/tool + buttonPosition)
    const wrappedCallback = onAddNode ? (context?: string, nodeId?: string, handleContext?: { handleType?: 'model' | 'memory' | 'tool'; buttonPosition?: { x: number; y: number } }) => {
      // Store context for modal to use when adding node
      if (context && nodeId) {
        (window as unknown as Record<string, unknown>).addNodeContext = { 
          context, 
          nodeId,
          handleType: handleContext?.handleType || null,
          buttonPosition: handleContext?.buttonPosition || null
        };
      } else if (handleContext?.handleType) {
        // If only handleType provided (with or without positioning)
        (window as unknown as Record<string, unknown>).addNodeContext = {
          handleType: handleContext.handleType,
          buttonPosition: handleContext?.buttonPosition || null
        };
      }
      onAddNode();
    } : null;
    
    _globalOnAddNode = wrappedCallback;
    // ALSO store on window so CustomNode can access it
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>)._globalOnAddNode = wrappedCallback;
    }
    
    return () => {
      _globalOnAddNode = null;
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>)._globalOnAddNode = null;
      }
    };
  }, [onAddNode]);

  // Initialize viewport with fixed zoom on load
  const onInit = useCallback((rf: ReactFlowInstance) => {
    rf.fitView({ padding: 0.2, maxZoom: 0.9, duration: 200 });
    
    // Expose fitView to parent via callback
    if (onFitView) {
      onFitView(() => {
        rf.fitView({ padding: 0.2, maxZoom: 0.9, duration: 200 });
      });
    }
    
    // Expose screenToFlowPosition to parent via callback
    if (onScreenToFlowPosition) {
      onScreenToFlowPosition(rf.screenToFlowPosition);
    }
  }, [onFitView, onScreenToFlowPosition]);

  // Sync store nodes to local state and add empty state node if needed
  // IMPORTANT: Also sync selectedNodeId to React Flow's selected prop
  useEffect(() => {
    if (storeNodes.length === 0) {
      
      // Show empty state node at center
      setNodes([
        {
          id: 'empty-state',
          type: 'emptyState',
          position: { x: 0, y: 0 },
          data: {}, // Empty data - callback is in _globalOnAddNode
          draggable: false,
          selectable: false,
        },
      ]);
    } else {
      // Mark nodes as selected based on store's selectedNodeId
      const nodesWithSelection = storeNodes.map(node => ({
        ...node,
        selected: node.id === selectedNodeId
      }));
      setNodes(nodesWithSelection);
    }
  }, [storeNodes, selectedNodeId, setNodes]);

  // Sync store edges to local state
  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Handle node changes (including deletions)
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Handle node removals FIRST (before selection)
    const removeChanges = changes.filter((change) => change.type === 'remove');
    if (removeChanges.length > 0) {
      removeChanges.forEach((change) => {
        // Clear selection immediately when node is being deleted
        setSelectedNode(null);
        deleteNode(change.id);
      });
    }
    
    onNodesChange(changes);
  }, [onNodesChange, deleteNode, setSelectedNode]);

  // Handle edge changes (including deletions)
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);

    // Handle edge removals
    const removeChanges = changes.filter((change) => change.type === 'remove');
    removeChanges.forEach((change) => {
      deleteEdge(change.id);
    });
  }, [onEdgesChange, deleteEdge]);

  // Save nodes to store after changes settle
  useEffect(() => {
    if (nodes.length > 0 || storeNodes.length > 0) {
      const timeoutId = setTimeout(() => {
        storeSetNodes(nodes);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, storeSetNodes, storeNodes.length]);

  // Save edges to store after changes settle
  useEffect(() => {
    if (edges.length > 0 || storeEdges.length > 0) {
      const timeoutId = setTimeout(() => {
        storeSetEdges(edges);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [edges, storeSetEdges, storeEdges.length]);

  // Handle edge deletion
  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    deleteEdge(edgeId);
  }, [setEdges, deleteEdge]);

  // Handle adding node in middle of edge
  const handleAddNodeOnEdge = useCallback((sourceId: string, targetId: string, edgeId: string) => {
    // Store context for inserting node
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).addNodeContext = { 
        context: 'insert',
        sourceId,
        targetId,
        edgeId
      };
    }
    // Trigger node palette
    if (onAddNode) {
      onAddNode();
    }
  }, [onAddNode]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        id: `${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        type: 'custom',
        data: { 
          onDelete: handleDeleteEdge,
          onAddNode: handleAddNodeOnEdge
        },
      };
      setEdges((eds) => addEdge(edge, eds));
      storeAddEdge(edge);
    },
    [setEdges, storeAddEdge, handleDeleteEdge, handleAddNodeOnEdge]
  );

  // Add handlers to existing edges (preserve ALL properties including targetHandle)
  useEffect(() => {
    setEdges((eds) => {
      const updated = eds.map((edge) => {
        const updatedEdge = {
          ...edge,  // Preserve ALL edge properties (including targetHandle!)
          type: edge.type || 'custom',
          data: { 
            ...edge.data,  // Preserve existing data
            onDelete: handleDeleteEdge,
            onAddNode: handleAddNodeOnEdge
          },
        };
        return updatedEdge;
      });
      return updated;
    });
  }, [handleDeleteEdge, handleAddNodeOnEdge, setEdges]);

  // Handle node click for selection only
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Don't select the empty state node
    if (node.id === 'empty-state') return;
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  // Handle pane click to deselect
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full w-full relative">
          <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        defaultViewport={{ x: 0, y: 0, zoom: 0.3 }}
        className="bg-background"
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        panOnDrag={false}
        panActivationKeyCode="Space"
        selectionOnDrag={true}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'custom',
          animated: true,
        }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={16} 
          size={1}
          className="bg-muted/20"
        />
          <AutoLayout enabled={true} />
          </ReactFlow>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-64">
        <ContextMenuItem 
          onClick={onSave}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          <span>Save Workflow</span>
          <ContextMenuShortcut>⌘S</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={onAutoLayout}
          disabled={layouting || nodesLength === 0}
        >
          {layouting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Network className="mr-2 h-4 w-4" />
          )}
          <span>Auto Layout</span>
          <ContextMenuShortcut>⌘L</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
