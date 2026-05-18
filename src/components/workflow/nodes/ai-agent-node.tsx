import { memo } from 'react';
import Image from 'next/image';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, Circle, Pin, Plus } from 'lucide-react';
import { useExecutionStore, type NodeStatus } from '@/stores/workflow/execution.store';
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config';

type GlobalAddNodeFn = (context: string, nodeId: string, handleContext?: { handleType?: string; buttonPosition?: { x: number; y: number }; excludeTriggers?: boolean }) => void;

const getGlobalOnAddNode = (): GlobalAddNodeFn | null => {
  if (typeof window !== 'undefined') {
    return (window as unknown as Record<string, unknown>).globalOnAddNode as GlobalAddNodeFn | null;
  }
  return null;
};

interface AIAgentNodeData {
  label: string;
  type: string;
  category?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  config?: Record<string, unknown>;
  pinnedData?: unknown[] | null;
}

// Status colors
const STATUS_COLORS: Record<NodeStatus, string> = {
  waiting: 'text-gray-400',
  running: 'text-blue-500',
  success: 'text-green-500',
  error: 'text-red-500',
  skipped: 'text-gray-300',
};

/**
 * AIAgentNode - Apple-like design for AI Agent nodes
 * Features:
 * - Rounded rectangle card design
 * - 3 bottom input connectors (Chat Model, Memory, Tool)
 * - Clean, minimal look inspired by Apple's design language
 */
export const AIAgentNode = memo(({ data, selected, id }: NodeProps<AIAgentNodeData>) => {
  // Get execution status
  const nodeStatuses = useExecutionStore((state) => state.nodeStatuses);
  const status = nodeStatuses.get(id);
  
  // Check if node has pinned data
  const hasPinnedData = data.pinnedData !== undefined && data.pinnedData !== null;
  
  // Get all edges to check connections
  const edges = useEdges();
  
  // Check if main workflow chain connections exist
  const hasIncomingConnection = edges.some(edge => edge.target === id && !edge.targetHandle); // Left input
  const hasOutgoingConnection = edges.some(edge => edge.source === id && !edge.sourceHandle); // Right output
  
  // Check if specific bottom inputs have connections
  const hasModelConnection = edges.some(edge => edge.target === id && edge.targetHandle === 'model');
  const hasMemoryConnection = edges.some(edge => edge.target === id && edge.targetHandle === 'memory');
  const hasToolConnection = edges.some(edge => edge.target === id && edge.targetHandle === 'tool');
  
  // Handle add node clicks for inputs
  const handleAddNodeBefore = (e: React.MouseEvent) => {
    e.stopPropagation();
    const addNode = getGlobalOnAddNode();
    if (addNode) {
      addNode('before', id);
    }
  };
  
  const handleAddModel = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[AIAgentNode] Model button clicked!');

    const addNode = getGlobalOnAddNode();
    if (addNode) {
      const button = e.currentTarget as HTMLElement;
      const rect = button.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;

      console.log('[AIAgentNode] Button rect:', {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: buttonCenterX
      });

      const contextData = {
        handleType: 'model',
        buttonPosition: { x: buttonCenterX, y: rect.bottom }
      };

      console.log('[AIAgentNode] Passing context to globalOnAddNode:', contextData);

      addNode('before', id, contextData);
    }
  };
  
  const handleAddMemory = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[AIAgentNode] Memory button clicked!');

    const addNode = getGlobalOnAddNode();
    if (addNode) {
      const button = e.currentTarget as HTMLElement;
      const rect = button.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;

      console.log('[AIAgentNode] Button rect:', {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: buttonCenterX
      });

      const contextData = {
        handleType: 'memory',
        buttonPosition: { x: buttonCenterX, y: rect.bottom }
      };

      console.log('[AIAgentNode] Passing context to globalOnAddNode:', contextData);

      addNode('before', id, contextData);
    }
  };
  
  const handleAddTool = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[AIAgentNode] Tool button clicked!');

    const addNode = getGlobalOnAddNode();
    if (addNode) {
      const button = e.currentTarget as HTMLElement;
      const rect = button.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;

      console.log('[AIAgentNode] Button rect:', {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: buttonCenterX
      });

      const contextData = {
        handleType: 'tool',
        buttonPosition: { x: buttonCenterX, y: rect.bottom }
      };

      console.log('[AIAgentNode] Passing context to globalOnAddNode:', contextData);

      addNode('before', id, contextData);
    }
  };
  
  const handleAddAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[AIAgentNode] Output/After button clicked!');

    const addNode = getGlobalOnAddNode();
    if (addNode) {
      const contextData = {
        excludeTriggers: true // Show general modal but exclude Trigger category
      };

      console.log('[AIAgentNode] Passing context to globalOnAddNode:', contextData);

      addNode('after', id, contextData);
    }
  };

  // Status icon
  const StatusIcon = status === 'running' ? Loader2 :
                     status === 'success' ? CheckCircle :
                     status === 'error' ? XCircle :
                     Circle;
  
  // Get icon URL
  const iconUrl = data.iconUrl;
  const _icon = data.icon;

  // Get label to display
  const getDisplayLabel = () => {
    const labelStr = typeof data.label === 'string' ? data.label : String(data.label);
    
    // Check if user has set a custom label (doesn't contain colon = custom)
    const hasCustomLabel = labelStr && !labelStr.includes(':');
    if (hasCustomLabel) {
      return labelStr;
    }
    
    // Check if action is selected (has colon)
    const hasAction = labelStr && labelStr.includes(':');
    if (hasAction) {
      const actionName = labelStr.split(':')[1]?.trim();
      return actionName || 'AI Summary Agent';
    }
    
    return 'AI Summary Agent';
  };

  return (
    <div className="relative">
      {/* Left Plus Button - Hide when connected */}
      {!hasIncomingConnection && (
        <button
          onClick={handleAddNodeBefore}
          className="absolute -left-14 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20 hover:border-primary hover:bg-accent flex items-center justify-center transition-all z-[9999] pointer-events-auto cursor-pointer shadow-md"
          title="Add node before"
        >
          <Plus className="w-4 h-4 text-muted-foreground pointer-events-none" />
        </button>
      )}

      {/* Right Plus Button - Hide when connected */}
      {!hasOutgoingConnection && (
        <button
          onClick={handleAddAfter}
          className="absolute -right-14 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20 hover:border-primary hover:bg-accent flex items-center justify-center transition-all z-[9999] pointer-events-auto cursor-pointer shadow-md"
          title="Add node after"
        >
          <Plus className="w-4 h-4 text-muted-foreground pointer-events-none" />
        </button>
      )}

      {/* Main Card - Apple-like rounded rectangle */}
      <div
        className={cn(
          'w-80 h-28 rounded-2xl border-2 bg-gradient-to-br from-background/95 to-popover/95 backdrop-blur-xl shadow-2xl',
          'flex items-center gap-4 px-5 relative overflow-hidden',
          selected ? 'border-purple-500 ring-4 ring-purple-500/20' : 'border-border/50',
          'hover:border-purple-500/50 transition-all duration-300',
          status === 'running' && 'ring-4 ring-purple-500 ring-offset-2'
        )}
      >
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
        
        {/* Pin Data Indicator */}
        {hasPinnedData && (
          <div className="absolute top-2 left-2 bg-purple-600 rounded-full p-1.5 z-10">
            <Pin className="w-3 h-3 text-white" />
          </div>
        )}
        
        {/* Status Indicator */}
        {status && (
          <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1.5 border border-border z-10 backdrop-blur-sm">
            <StatusIcon 
              className={cn(
                'w-4 h-4',
                STATUS_COLORS[status],
                status === 'running' && 'animate-spin'
              )}
            />
          </div>
        )}

        {/* Icon - Left side */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center flex-shrink-0 border border-purple-500/20">
          {iconUrl && typeof iconUrl === 'object' && 'light' in iconUrl && iconUrl.light ? (
            <Image
              src={getLucidL2IconUrl(iconUrl.light)}
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
              unoptimized
            />
          ) : iconUrl && typeof iconUrl === 'string' ? (
            <Image
              src={getLucidL2IconUrl(iconUrl)}
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-3xl" role="img" aria-label="ai icon">
              🤖
            </span>
          )}
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground mb-0.5 truncate">
            {getDisplayLabel()}
          </h3>
          <p className="text-xs text-muted-foreground">
            Double-click to open
          </p>
        </div>

        {/* Left Input Handle (Main workflow chain) */}
        <Handle
          type="target"
          position={Position.Left}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 !bg-purple-500 !-translate-x-1/2 !border-2 !border-white z-10"
          style={{ left: 0, background: '#a855f7', borderColor: 'var(--background)' }}
        />

        {/* Right Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 !bg-purple-500 !translate-x-1/2 !border-2 !border-white z-10"
          style={{ right: 0, background: '#a855f7', borderColor: 'var(--background)' }}
        />
      </div>

      {/* Bottom Input Connectors - Apple style */}
      <div className="absolute -bottom-12 left-0 right-0 flex items-start justify-center gap-12">
        {/* Chat Model Input */}
        <div className="flex flex-col items-center gap-1">
          <Handle
            type="target"
            position={Position.Bottom}
            id="model"
            className="w-3 h-3 !bg-blue-500 !border-2 !border-background"
            style={{
              background: '#3b82f6',
              borderColor: 'var(--background)',
              left: '25%',  // 80px from left on 320px node
              transform: 'translateX(-50%)'
            }}
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Chat Model<span className="text-red-500">*</span>
          </span>
          {/* Plus button */}
          {!hasModelConnection && (
            <button
              onClick={handleAddModel}
              className="w-4 h-4 rounded-full bg-background/90 border border-border hover:border-blue-500 hover:bg-popover flex items-center justify-center transition-all cursor-pointer shadow-lg backdrop-blur-sm"
              title="Add model"
            >
              <Plus className="w-3 h-3 text-muted-foreground hover:text-blue-400" />
            </button>
          )}
        </div>

        {/* Memory Input */}
        <div className="flex flex-col items-center gap-1">
          <Handle
            type="target"
            position={Position.Bottom}
            id="memory"
            className="w-3 h-3 !bg-purple-500 !border-2 !border-background"
            style={{
              background: '#a855f7',
              borderColor: 'var(--background)',
              left: '50%',  // 160px from left on 320px node (center)
              transform: 'translateX(-50%)'
            }}
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Memory
          </span>
          {/* Plus button */}
          {!hasMemoryConnection && (
            <button
              onClick={handleAddMemory}
              className="w-4 h-4 rounded-full bg-background/90 border border-border hover:border-purple-500 hover:bg-popover flex items-center justify-center transition-all cursor-pointer shadow-lg backdrop-blur-sm"
              title="Add memory"
            >
              <Plus className="w-3 h-3 text-muted-foreground hover:text-purple-400" />
            </button>
          )}
        </div>

        {/* Tool Input */}
        <div className="flex flex-col items-center gap-1">
          <Handle
            type="target"
            position={Position.Bottom}
            id="tool"
            className="w-3 h-3 !bg-green-500 !border-2 !border-background"
            style={{
              background: '#22c55e',
              borderColor: 'var(--background)',
              left: '75%',  // 240px from left on 320px node
              transform: 'translateX(-50%)'
            }}
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Tool
          </span>
          {/* Plus button */}
          {!hasToolConnection && (
            <button
              onClick={handleAddTool}
              className="w-4 h-4 rounded-full bg-background/90 border border-border hover:border-green-500 hover:bg-popover flex items-center justify-center transition-all cursor-pointer shadow-lg backdrop-blur-sm"
              title="Add tool"
            >
              <Plus className="w-3 h-3 text-muted-foreground hover:text-green-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

AIAgentNode.displayName = 'AIAgentNode';
