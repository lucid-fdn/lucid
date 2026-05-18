'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { WorkflowCanvas } from '@/components/workflow/canvas/workflow-canvas';
import dynamic from 'next/dynamic';

const NodePaletteModal = dynamic(() => import('@/components/workflow/node-palette-modal').then(mod => ({ default: mod.NodePaletteModal })), { ssr: false });
import { NodeActionSelector } from '@/components/workflow/node-action-selector';
import { NodeConfigPanel } from '@/components/workflow/config/node-config-panel';
import { getNodeType } from '@/components/workflow/nodes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Play,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
  History,
  Webhook,
  Clock,
  Variable,
  GitBranch,
  MoreVertical
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { useExecutionStore, type NodeStatus } from '@/stores/workflow/execution.store';
import { useWorkflowActions } from '@/hooks/use-workflow-actions';
import { AIWorkflowDialog } from '@/components/workflow/ai-workflow-dialog';
import { autoLayoutNodes } from '@/lib/workflow/auto-layout';
import type { CachedUser } from '@/lib/auth/cache';
import type { Node, Edge } from 'reactflow';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: Node[];
  edges: Edge[];
  pin_data: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Node definition from the palette (n8n-style) */
interface NodeDefinition {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  category?: string;
  group?: string[];
}

/** Context stored on window for add-node positioning */
interface AddNodeContext {
  context?: 'before' | 'after' | 'insert';
  nodeId?: string;
  sourceId?: string;
  targetId?: string;
  edgeId?: string;
  handleType?: 'model' | 'memory' | 'tool' | null;
  buttonPosition?: { x: number; y: number } | null;
  excludeTriggers?: boolean;
}

/** Status update from execution polling */
interface ExecutionStatusUpdate {
  data?: {
    nodeData?: Record<string, {
      status: string;
      output?: unknown;
      error?: string;
    }>;
  };
}

/** Result from execution (local UI shape for status checking) */
interface LocalExecutionResult {
  data?: {
    status: string;
    error?: string;
  };
}

/** Action selection from node action selector */
interface _ActionSelection {
  resource: string;
  operation: string;
  action: { action?: string; value?: string } | string;
  parameters?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

/** Typed accessor for global window state used by node palette */
const getWindowAddNodeContext = (): AddNodeContext | undefined =>
  (typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, unknown>).addNodeContext as AddNodeContext | undefined));
const _setWindowAddNodeContext = (ctx: AddNodeContext | undefined) => {
  (window as unknown as Record<string, unknown>).addNodeContext = ctx;
};
const clearWindowAddNodeContext = () => {
  delete (window as unknown as Record<string, unknown>).addNodeContext;
};

interface WorkflowEditorProps {
  initialWorkflow: Workflow;
  workspaceSlug: string;
  user: CachedUser;
}

export function WorkflowEditor({ 
  initialWorkflow, 
  workspaceSlug,
  user: _user
}: WorkflowEditorProps) {
  const router = useRouter();
  const toast = useToast();
  
  // n8n workflow actions (save, execute, poll)
  const { executeAndPoll, stopPolling } = useWorkflowActions(initialWorkflow.id, {
    debug: process.env.NODE_ENV === 'development'
  });
  
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [name, setName] = useState(initialWorkflow.name);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [_historyOpen, setHistoryOpen] = useState(false);
  const [_webhooksOpen, setWebhooksOpen] = useState(false);
  const [_schedulesOpen, setSchedulesOpen] = useState(false);
  const [_variablesOpen, setVariablesOpen] = useState(false);
  const [_versionsOpen, setVersionsOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false);
  const [nodePaletteContext, setNodePaletteContext] = useState<'model' | 'memory' | 'tool' | null>(null);
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [selectedNodeForAction, setSelectedNodeForAction] = useState<NodeDefinition | null>(null);
  const [savedAddNodeContext, setSavedAddNodeContext] = useState<AddNodeContext | null>(null);
  const [layouting, setLayouting] = useState(false);
  const [configPanelOpen, _setConfigPanelOpen] = useState(true);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fitViewRef = useRef<(() => void) | null>(null);
  const lastSavedStateRef = useRef({ nodes: initialWorkflow.nodes, edges: initialWorkflow.edges, name: initialWorkflow.name });
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setNodes = useCanvasStore((state) => state.setNodes);
  const setEdges = useCanvasStore((state) => state.setEdges);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const setSkipNextAutoLayout = useCanvasStore((state) => state.setSkipNextAutoLayout);
  
  const screenToFlowPositionRef = useRef<((pos: { x: number; y: number }) => { x: number; y: number }) | null>(null);
  
  const startExecution = useExecutionStore((state) => state.startExecution);
  const updateNodeStatus = useExecutionStore((state) => state.updateNodeStatus);
  const finishExecution = useExecutionStore((state) => state.finishExecution);
  const setNodeOutput = useExecutionStore((state) => state.setNodeOutput);

  // Initialize canvas with workflow data
  useEffect(() => {
    if (initialWorkflow.nodes && initialWorkflow.edges) {
      setNodes(initialWorkflow.nodes);
      setEdges(initialWorkflow.edges);
      lastSavedStateRef.current = {
        nodes: initialWorkflow.nodes,
        edges: initialWorkflow.edges,
        name: initialWorkflow.name
      };
    }
  }, [initialWorkflow, setNodes, setEdges]);

  // Track changes against last saved state
  useEffect(() => {
    const nodesChanged = JSON.stringify(nodes) !== JSON.stringify(lastSavedStateRef.current.nodes);
    const edgesChanged = JSON.stringify(edges) !== JSON.stringify(lastSavedStateRef.current.edges);
    const nameChanged = name !== lastSavedStateRef.current.name;
    
    setHasUnsavedChanges(nodesChanged || edgesChanged || nameChanged);
  }, [nodes, edges, name]);

  // Auto-save functionality
  const saveWorkflow = useCallback(async (showToast = true) => {
    setSaving(true);

    try {
      // Extract pin data from nodes
      const pinData: Record<string, unknown> = {};
      nodes.forEach(node => {
        if (node.data.pinnedData) {
          pinData[node.id] = node.data.pinnedData;
        }
      });

      // 1. Save to Supabase (database)
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nodes,
          edges,
          pin_data: pinData,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save workflow');
      }

      setWorkflow(result.data);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      // Update the baseline for change tracking
      lastSavedStateRef.current = {
        nodes: result.data.nodes,
        edges: result.data.edges,
        name: result.data.name
      };

      if (showToast) {
        toast.success('Workflow saved');
      }
    } catch (error) {
      toast.error(
        'Failed to save workflow',
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setSaving(false);
    }
  }, [workflow.id, name, nodes, edges, toast]);

  // Auto-save debounced
  useEffect(() => {
    if (hasUnsavedChanges) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save (3 seconds)
      saveTimeoutRef.current = setTimeout(() => {
        saveWorkflow(false); // Silent save
      }, 3000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, saveWorkflow]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Execute workflow via n8n
  const executeWorkflow = async () => {
    // Save first if there are unsaved changes
    if (hasUnsavedChanges) {
      await saveWorkflow(false);
    }

    setExecuting(true);
    
    // Start execution in store
    startExecution(workflow.id, 'manual');
    
    // Set all nodes to waiting
    nodes.forEach(node => {
      updateNodeStatus(node.id, 'waiting');
    });

    try {
      // Execute via n8n and poll for status
      const result = await executeAndPoll(undefined, (statusUpdate) => {
        // Update node statuses from n8n
        const nodeData = (statusUpdate as unknown as ExecutionStatusUpdate).data?.nodeData;
        if (nodeData) {
          Object.entries(nodeData).forEach(([nodeId, data]) => {
            updateNodeStatus(nodeId, data.status as NodeStatus);
            if (data.output) {
              setNodeOutput(nodeId, data.output, data.error);
            }
          });
        }
      });

      // Final status update
      const execResult = result as unknown as LocalExecutionResult | undefined;
      if (execResult?.data?.status === 'success') {
        finishExecution('success');
        toast.success('Workflow executed successfully');
      } else if (execResult?.data?.status === 'error') {
        finishExecution('error', execResult.data.error);
        toast.error(
          'Workflow execution failed',
          execResult.data.error
        );
      }
    } catch (error) {
      finishExecution('error', error instanceof Error ? error.message : 'Unknown error');
      
      // Mark running nodes as error
      nodes.forEach(node => {
        const status = useExecutionStore.getState().nodeStatuses.get(node.id);
        if (status === 'running' || status === 'waiting') {
          updateNodeStatus(node.id, 'error');
        }
      });
      
      toast.error(
        'Failed to execute workflow',
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setExecuting(false);
    }
  };

  // Manual save
  const handleSave = () => {
    saveWorkflow(true);
  };

  // Save indicator
  const getSaveStatus = () => {
    if (saving) {
      return (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </span>
      );
    }

    if (hasUnsavedChanges) {
      return (
        <span className="flex items-center gap-2 text-sm text-yellow-600">
          <AlertCircle className="h-4 w-4" />
          Unsaved changes
        </span>
      );
    }

    if (lastSaved) {
      return (
        <span className="flex items-center gap-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Saved {formatTimeSince(lastSaved)}
        </span>
      );
    }

    return null;
  };

  const formatTimeSince = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Handle manual layout trigger
  const handleAutoLayout = async () => {
    setLayouting(true);
    try {
      const layouted = await autoLayoutNodes(nodes, edges);
      setNodes(layouted);

      // Recenter and zoom to fit after layout
      setTimeout(() => {
        if (fitViewRef.current) {
          fitViewRef.current();
        }
      }, 100);
    } catch (_error) {
      // Auto-layout failed silently
    } finally {
      setLayouting(false);
    }
  };

  // Handle AI-generated workflow
  const handleAIGenerated = useCallback((generatedNodes: unknown[], generatedEdges: unknown[]) => {
    setNodes(generatedNodes as Node[]);
    setEdges(generatedEdges as Edge[]);
    setHasUnsavedChanges(true);
    toast.success('AI workflow loaded to canvas');
  }, [setNodes, setEdges, toast]);

  // Handle node selection from palette
  const handleSelectNode = useCallback((node: NodeDefinition) => {
    // CRITICAL: Save context to React state BEFORE modal closes
    const currentContext = getWindowAddNodeContext();
    if (currentContext) {
      setSavedAddNodeContext(currentContext);
    }

    // Check if it's a trigger node
    const isTrigger = node.group?.includes('trigger');

    if (isTrigger) {
      // Trigger nodes: Add directly to canvas (no action selection needed)

      // Check for add node context
      const context = getWindowAddNodeContext();
      let position = { x: 250, y: 250 };
      let savedContext = null;

      // SPECIAL: Handle AI Agent bottom handle positions (model/memory/tool)
      if (context && context.handleType && context.nodeId) {
        const refNode = nodes.find(n => n.id === context.nodeId);
        
        if (refNode) {
          // AI Agent node is w-80 (320px wide)
          const agentNodeWidth = 320;
          const agentNodeHeight = 112;
          
          // Resource node is w-14 (56px diameter)
          const resourceNodeWidth = 56;
          const halfResourceNode = resourceNodeWidth / 2;
          
          // Calculate Y position well below AI Agent
          const yPos = refNode.position.y + agentNodeHeight + 150; // 150px gap for clean layout
          
          // Position nodes with wider horizontal spread for better edge routing
          // Model and Tool should be positioned further from center
          switch (context.handleType) {
            case 'model':
              // Position left of center (at 25% from AI Agent left edge)
              position = { 
                x: refNode.position.x + (agentNodeWidth * 0.25) - halfResourceNode,
                y: yPos
              };
              break;
            case 'memory':
              // Position at exact center
              position = { 
                x: refNode.position.x + (agentNodeWidth / 2) - halfResourceNode,
                y: yPos
              };
              break;
            case 'tool':
              // Position right of center (at 75% from AI Agent left edge)
              position = {
                x: refNode.position.x + (agentNodeWidth * 0.75) - halfResourceNode,
                y: yPos
              };
              break;
          }
          savedContext = { ...context };
          clearWindowAddNodeContext();
        }
      }
      
      // Handle INSERT context (adding node in middle of edge)
      if (context && context.context === 'insert') {
        savedContext = { ...context };
        
        // Find source and target nodes for positioning
        const sourceNode = nodes.find(n => n.id === context.sourceId);
        const targetNode = nodes.find(n => n.id === context.targetId);
        
        if (sourceNode && targetNode) {
          // Position new node between source and target
          position = {
            x: (sourceNode.position.x + targetNode.position.x) / 2,
            y: (sourceNode.position.y + targetNode.position.y) / 2
          };
        }

        clearWindowAddNodeContext();
      } else if (context && context.nodeId) {
        // Adding before/after an existing node
        savedContext = { ...context }; // Save before clearing
        const refNode = nodes.find(n => n.id === context.nodeId);

        if (refNode) {
          // Position 300px to the right if "after", 300px to the left if "before"
          position = context.context === 'after'
            ? { x: refNode.position.x + 300, y: refNode.position.y }
            : { x: refNode.position.x - 300, y: refNode.position.y };
        }

        // Clear context from window
        clearWindowAddNodeContext();
      } else {
        // Get position from empty-state node if it exists
        const emptyStateNode = nodes.find(n => n.id === 'empty-state');

        if (emptyStateNode) {
          position = { x: emptyStateNode.position.x, y: emptyStateNode.position.y };
        }
      }
      
      const newNode = {
        id: `${node.name}-${Date.now()}`,
        type: getNodeType(node), // Dynamic type based on node group
        position,
        data: {
          label: node.displayName,
          type: node.name,
          nodeType: node.name,
          description: node.description,
          icon: node.icon,
          iconUrl: node.iconUrl,
          category: node.category || node.group?.[0],
          definition: node,
          parameters: {},
          settings: {
            alwaysOutputData: false,
            executeOnce: false,
            retryOnFail: false,
            onError: 'stopWorkflow',
            notes: '',
            displayNoteInFlow: false
          }
        },
      };

      addNode(newNode);
      
      // Handle INSERT context (node in middle of edge)
      if (savedContext && savedContext.context === 'insert') {
        // Delete the original edge
        deleteEdge(savedContext.edgeId!);
        
        // Create two new edges: source → new node → target
        const edge1 = {
          id: `${savedContext.sourceId}-${newNode.id}`,
          source: savedContext.sourceId!,
          target: newNode.id,
          type: 'custom',
          animated: true,
        };
        const edge2 = {
          id: `${newNode.id}-${savedContext.targetId}`,
          source: newNode.id,
          target: savedContext.targetId!,
          type: 'custom',
          animated: true,
        };
        
        addEdge(edge1);
        addEdge(edge2);
      }
      // Create edge for AI Agent handles (model/memory/tool)
      else if (savedContext && savedContext.handleType && savedContext.nodeId) {
        const newEdge = {
          id: `${newNode.id}-${savedContext.nodeId}`,
          source: newNode.id,
          target: savedContext.nodeId,
          targetHandle: savedContext.handleType, // Connect to specific handle (model/memory/tool)
          type: 'custom',
          animated: true,
        };
        addEdge(newEdge);
      }
      // Create edge if adding after an existing node (use savedContext)
      else if (savedContext && savedContext.nodeId && savedContext.context === 'after') {
        const newEdge = {
          id: `${savedContext.nodeId}-${newNode.id}`,
          source: savedContext.nodeId,
          target: newNode.id,
          type: 'custom',
          animated: true,
        };
        addEdge(newEdge);
      } else if (savedContext && savedContext.nodeId && savedContext.context === 'before') {
        const newEdge = {
          id: `${newNode.id}-${savedContext.nodeId}`,
          source: newNode.id,
          target: savedContext.nodeId,
          type: 'custom',
          animated: true,
        };
        addEdge(newEdge);
      }

      setNodePaletteOpen(false);
      toast.success('Trigger added to canvas');
    } else {
      // Action nodes: Open action selector
      setSelectedNodeForAction(node);
      setNodePaletteOpen(false);
      setShowActionSelector(true);
    }
  }, [nodes, addNode, addEdge, deleteEdge, toast, setSavedAddNodeContext]);

  // Handle action selection - creates node with selected action
  const handleSelectAction = useCallback((action: {
    resource: string
    operation: string
    action: { action?: string; value?: string } | string
    parameters?: Record<string, unknown>
    settings?: Record<string, unknown>
  }) => {
    if (!selectedNodeForAction) {
      return;
    }

    const node = selectedNodeForAction;

    // Check for add node context (use saved React state if window context was cleared)
    const windowContext = getWindowAddNodeContext();
    const context = windowContext || savedAddNodeContext;
    let position = { x: 250, y: 250 };
    let savedContext = null;
    
    // SPECIAL: Handle AI Agent bottom handle positions (model/memory/tool)
    // Industry standard: Use button's actual screen position, convert to canvas coordinates
    if (context && context.handleType && context.nodeId && context.buttonPosition) {
      // Use React Flow's screenToFlowPosition to properly handle zoom/pan
      if (!screenToFlowPositionRef.current) {
        savedContext = { ...context };
        clearWindowAddNodeContext();
        return;
      }
      
      const flowPosition = screenToFlowPositionRef.current({
        x: context.buttonPosition.x,
        y: context.buttonPosition.y
      });

      // New node dimensions
      const newNodeWidth = 56; // Resource node width (w-14)
      
      // Position new node centered on button's X, at SAME Y level for all three
      // Use consistent Y offset for perfect horizontal alignment
      const yOffset = 100; // Standard gap below AI Agent for all resource nodes
      
      position = {
        x: flowPosition.x - newNodeWidth / 2,
        y: flowPosition.y + yOffset
      };

      // CRITICAL: Skip auto-layout for manually positioned node
      setSkipNextAutoLayout(true);
      
      savedContext = { ...context };
      clearWindowAddNodeContext();
    }
    
    // Handle INSERT context
    if (!savedContext && context && context.context === 'insert') {
      savedContext = { ...context };
      const sourceNode = nodes.find(n => n.id === context.sourceId);
      const targetNode = nodes.find(n => n.id === context.targetId);
      
      if (sourceNode && targetNode) {
        position = {
          x: (sourceNode.position.x + targetNode.position.x) / 2,
          y: (sourceNode.position.y + targetNode.position.y) / 2
        };
      }
      
      clearWindowAddNodeContext();
    } else if (!savedContext && context && context.nodeId) {
      savedContext = { ...context };
      const refNode = nodes.find(n => n.id === context.nodeId);
      
      if (refNode) {
        position = context.context === 'after'
          ? { x: refNode.position.x + 300, y: refNode.position.y }
          : { x: refNode.position.x - 300, y: refNode.position.y };
      }
      
      clearWindowAddNodeContext();
    }
    
    // Extract action name from action object
    const actionName = typeof action.action === 'object' && action.action.action 
      ? action.action.action 
      : typeof action.action === 'string'
        ? action.action
        : 'Unknown Action';
    
    const newNode = {
      id: `${node.name}-${Date.now()}`,
      type: getNodeType(node), // Dynamic type based on node group
      position,
      data: {
        label: `${node.displayName}: ${actionName}`,
        type: node.name,
        nodeType: node.name,
        description: node.description,
        icon: node.icon,
        iconUrl: node.iconUrl,
        category: node.category || node.group?.[0],
        definition: node,
        selectedAction: {
          resource: action.resource,
          operation: action.operation,
          actionName: actionName,
          actionValue: typeof action.action === 'object' && action.action.value 
            ? action.action.value 
            : action.action
        },
        parameters: action.parameters || {},
        settings: action.settings || {
          alwaysOutputData: false,
          executeOnce: false,
          retryOnFail: false,
          onError: 'stopWorkflow',
          notes: '',
          displayNoteInFlow: false
        }
      },
    };

    addNode(newNode);
    
    // Handle INSERT context (node in middle of edge)
    if (savedContext && savedContext.context === 'insert') {
      // Delete original edge
      deleteEdge(savedContext.edgeId!);

      // Create two new edges
      const edge1 = {
        id: `${savedContext.sourceId}-${newNode.id}`,
        source: savedContext.sourceId!,
        target: newNode.id,
        type: 'custom',
        animated: true,
      };
      const edge2 = {
        id: `${newNode.id}-${savedContext.targetId}`,
        source: newNode.id,
        target: savedContext.targetId!,
        type: 'custom',
        animated: true,
      };
      addEdge(edge1);
      addEdge(edge2);
    }
    // Create edge for AI Agent handles (model/memory/tool)
    else if (savedContext && savedContext.handleType && savedContext.nodeId) {
      const newEdge = {
        id: `${newNode.id}-${savedContext.nodeId}`,
        source: newNode.id,
        target: savedContext.nodeId,
        targetHandle: savedContext.handleType, // Connect to specific handle (model/memory/tool)
        type: 'custom',
        animated: true,
      };
      addEdge(newEdge);
    }
    // Create edge if adding after an existing node
    else if (savedContext && savedContext.nodeId && savedContext.context === 'after') {
      const newEdge = {
        id: `${savedContext.nodeId}-${newNode.id}`,
        source: savedContext.nodeId,
        target: newNode.id,
        type: 'custom',
        animated: true,
      };
      addEdge(newEdge);
    } 
    else if (savedContext && savedContext.nodeId && savedContext.context === 'before') {
      const newEdge = {
        id: `${newNode.id}-${savedContext.nodeId}`,
        source: newNode.id,
        target: savedContext.nodeId,
        type: 'custom',
        animated: true,
      };
      addEdge(newEdge);
    }
    
    setShowActionSelector(false);
    setSelectedNodeForAction(null);
    setSavedAddNodeContext(null); // Clear saved context

    // Show success toast
    toast.success('Node added to canvas');
  }, [selectedNodeForAction, nodes, addNode, addEdge, deleteEdge, toast, savedAddNodeContext, setSavedAddNodeContext, setSkipNextAutoLayout]);

  return (
    <div className="relative w-full h-full">
      {/* Canvas - Full Background */}
      <div className="absolute inset-0">
        <WorkflowCanvas 
          onAddNode={() => setNodePaletteOpen(true)}
          onSave={handleSave}
          onAutoLayout={handleAutoLayout}
          onFitView={(fitView) => { fitViewRef.current = fitView; }}
          onScreenToFlowPosition={(fn) => { screenToFlowPositionRef.current = fn; }}
          saving={saving}
          layouting={layouting}
          hasUnsavedChanges={hasUnsavedChanges}
          nodesLength={nodes.length}
        />
      </div>

      {/* Header - Floating on top */}
      <div className="absolute top-4 left-4 right-4 z-50 backdrop-blur-lg bg-black/40 border border-white/10 rounded-2xl pl-2 pr-6 py-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${workspaceSlug}/workflows`)}
            >
              <ArrowLeft className="h-8 w-8" />
            </Button>

            <div className="group flex items-center gap-2 pl-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-64 border-transparent bg-transparent hover:border-white/10 hover:bg-white/5 focus:border-white/20 focus:bg-white/10 transition-all"
                placeholder="Workflow name"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getSaveStatus()}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setWebhooksOpen(true)}
                  >
                    <Webhook className="h-4 w-4 mr-2" />
                    Webhooks
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setSchedulesOpen(true)}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Schedules
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setVariablesOpen(true)}
                  >
                    <Variable className="h-4 w-4 mr-2" />
                    Variables
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setVersionsOpen(true)}
                  >
                    <GitBranch className="h-4 w-4 mr-2" />
                    Versions
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <History className="h-4 w-4 mr-2" />
                    History
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              onClick={executeWorkflow}
              disabled={executing || nodes.length === 0}
            >
              {executing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Execute
            </Button>
          </div>
        </div>
      </div>

      {/* Node Config - Floating Right Panel */}
      <AnimatePresence>
        {configPanelOpen && selectedNodeId && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute top-22 right-4 bottom-4 w-80 z-40 bg-background border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <NodeConfigPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Palette Modal */}
      {(() => {
        // Filter out the empty-state node when checking if workflow is truly empty
        const realNodes = nodes.filter(n => n.id !== 'empty-state');
        
        // Check for context from AI Agent plus buttons (client-side only)
        const context = typeof window !== 'undefined' ? getWindowAddNodeContext() : null;
        const contextualFilter = context?.handleType || nodePaletteContext;
        
        // Determine trigger filtering logic:
        // 1. If excludeTriggers flag is present, show all nodes EXCEPT triggers (filterToTriggersOnly=false)
        // 2. Otherwise, filter to triggers only if workflow is empty
        const shouldFilterToTriggers = context?.excludeTriggers 
          ? false  // excludeTriggers = show action nodes (not triggers)
          : realNodes.length === 0; // Empty workflow = show only triggers
        
        return (
          <NodePaletteModal
            open={nodePaletteOpen}
            onOpenChange={(open) => {
              setNodePaletteOpen(open);
              if (!open) {
                setNodePaletteContext(null); // Clear context when closing
                // Also clear window context
                if (getWindowAddNodeContext()?.handleType || getWindowAddNodeContext()?.excludeTriggers) {
                  clearWindowAddNodeContext();
                }
              } else {
                // When opening, set the context from window if available
                if (context?.handleType) {
                  setNodePaletteContext(context.handleType);
                }
              }
            }}
            onSelectNode={handleSelectNode}
            filterToTriggersOnly={shouldFilterToTriggers}
            filterContext={contextualFilter}
          />
        );
      })()}

      {/* Action Selector - Opens after node selection */}
      {selectedNodeForAction && (
        <NodeActionSelector
          open={showActionSelector}
          onOpenChange={(open: boolean) => {
            setShowActionSelector(open);
            if (!open) {
              setSelectedNodeForAction(null);
            }
          }}
          node={{
            id: 'temp',
            data: {
              label: selectedNodeForAction.displayName,
              definition: { ...selectedNodeForAction } as Record<string, unknown>,
              icon: selectedNodeForAction.icon,
              iconUrl: selectedNodeForAction.iconUrl
            }
          }}
          onSelectAction={handleSelectAction}
        />
      )}

      {/* AI Workflow Dialog */}
      <AIWorkflowDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onWorkflowGenerated={handleAIGenerated}
      />
    </div>
  );
}
