import { memo } from 'react';
import Image from 'next/image';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, Circle, Pin, Plus } from 'lucide-react';
import { useExecutionStore, type NodeStatus } from '@/stores/workflow/execution.store';
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config';

interface TriggerNodeData {
  label: string;
  type: string;
  category?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  config?: Record<string, unknown>;
  pinnedData?: unknown[] | null;
}

// Status colors — using workflow design system classes from workflow.css
const STATUS_COLORS: Record<NodeStatus, string> = {
  waiting: 'workflow-status-waiting-text',
  running: 'workflow-status-running-text',
  success: 'workflow-status-success-text',
  error: 'workflow-status-error-text',
  skipped: 'text-gray-300',
};

/**
 * TriggerNode - Specialized node for workflow triggers
 * Features:
 * - Circular design (industry standard for start/trigger nodes)
 * - Large centered icon
 * - Single output handle (right)
 * - No input handle (triggers are always first)
 * - Clean, minimal design
 */
export const TriggerNode = memo(({ data, selected, id }: NodeProps<TriggerNodeData>) => {
  // Get execution status
  const nodeStatuses = useExecutionStore((state) => state.nodeStatuses);
  const status = nodeStatuses.get(id);
  
  // Check if node has pinned data
  const hasPinnedData = data.pinnedData !== undefined && data.pinnedData !== null;
  
  // Get all edges to check connections
  const edges = useEdges();
  
  // Check if node has outgoing connections (source)
  const hasOutgoingConnection = edges.some(edge => edge.source === id);
  
  // Handle add node after
  const handleAddNodeAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined' && (window as unknown as { globalOnAddNode?: (position: string, nodeId: string) => void }).globalOnAddNode) {
      (window as unknown as { globalOnAddNode: (position: string, nodeId: string) => void }).globalOnAddNode('after', id);
    }
  };

  // Status icon
  const StatusIcon = status === 'running' ? Loader2 :
                     status === 'success' ? CheckCircle :
                     status === 'error' ? XCircle :
                     Circle;

  // Trigger color from CSS design tokens
  const color = 'var(--workflow-node-trigger-hex)';
  
  // Get icon URL if available
  const iconUrl = data.iconUrl;
  const icon = data.icon;

  return (
    <div className="relative">
      {/* Main circular node */}
      <div
        className={cn(
          'w-24 h-24 rounded-full border-4 bg-background shadow-xl flex items-center justify-center relative',
          selected ? 'border-primary ring-4 ring-primary/20' : 'border-border',
          'hover:shadow-2xl transition-all duration-200',
          status === 'running' && 'ring-4 ring-blue-500 ring-offset-2'
        )}
        style={{
          borderColor: selected ? undefined : color,
        }}
      >
        {/* Pin Data Indicator */}
        {hasPinnedData && (
          <div className="absolute -top-2 -left-2 bg-blue-600 rounded-full p-1.5 z-10">
            <Pin className="w-3 h-3 text-white" />
          </div>
        )}
        
        {/* Status Indicator */}
        {status && (
          <div className="absolute -top-2 -right-2 bg-background rounded-full p-1.5 border-2 border-background z-10">
            <StatusIcon 
              className={cn(
                'w-5 h-5',
                STATUS_COLORS[status],
                status === 'running' && 'animate-spin'
              )}
            />
          </div>
        )}

        {/* Large centered icon */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
        >
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
          ) : icon && typeof icon === 'string' && icon.startsWith('fa:') ? (
            <i className={`fa fa-${icon.replace('fa:', '')} text-2xl`} style={{ color }} />
          ) : (
            <span className="text-3xl" role="img" aria-label="trigger icon">
              ⚡
            </span>
          )}
        </div>
      </div>

      {/* Label below node */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
        <div className="text-xs font-medium text-muted-foreground">
          {/* Show custom label, event name, or placeholder */}
          {(() => {
            // Check if user has set a custom label (doesn't contain colon = custom)
            const hasCustomLabel = data.label && !data.label.includes(':');
            if (hasCustomLabel) {
              return data.label; // Show custom label
            }
            
            // Check if action is selected (has colon)
            const hasAction = data.label && data.label.includes(':');
            if (hasAction) {
              const eventName = data.label.split(':')[1]?.trim();
              return eventName || 'Select an Event';
            }
            
            // No action selected - show placeholder
            return 'Select an Event';
          })()}
        </div>
        <div className="text-sm font-semibold">
          When
        </div>
      </div>

      {/* Output Handle with "+" button */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">
        {/* Handle */}
        <Handle
          type="source"
          position={Position.Right}
          className="w-4 h-4 !bg-primary !translate-x-1/2 !border-2 !border-background"
        />
        
        {/* Connecting line and Plus button - only show if NOT connected */}
        {!hasOutgoingConnection && (
          <>
            {/* Connecting line */}
            <div className="absolute left-2 w-5 h-0.5 bg-muted-foreground/20" />
            {/* Plus button */}
            <button
              onClick={handleAddNodeAfter}
              className="absolute -right-14 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20 hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex items-center justify-center transition-all z-[9999] pointer-events-auto cursor-pointer shadow-md"
              title="Add node"
            >
              <Plus className="w-4 h-4 text-muted-foreground pointer-events-none" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
