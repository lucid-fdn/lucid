import { memo } from 'react';
import Image from 'next/image';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, Circle, Pin, Plus } from 'lucide-react';
import { useExecutionStore, type NodeStatus } from '@/stores/workflow/execution.store';
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config';

interface ActionNodeData {
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
 * ActionNode - Specialized node for workflow actions
 * Features:
 * - Square design with subtle border radius
 * - Large centered icon
 * - Input and output handles
 * - Action description below
 * - Clean, minimal design
 */
export const ActionNode = memo(({ data, selected, id }: NodeProps<ActionNodeData>) => {
  // Get execution status
  const nodeStatuses = useExecutionStore((state) => state.nodeStatuses);
  const status = nodeStatuses.get(id);
  
  // Check if node has pinned data
  const hasPinnedData = data.pinnedData !== undefined && data.pinnedData !== null;
  
  // Get all edges to check connections
  const edges = useEdges();
  
  // Check if node has incoming connections (target)
  const hasIncomingConnection = edges.some(edge => edge.target === id);
  
  // Check if node has outgoing connections (source)
  const hasOutgoingConnection = edges.some(edge => edge.source === id);
  
  // Handle add node clicks
  const handleAddNodeBefore = (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : undefined;
    if (win && typeof win.globalOnAddNode === 'function') {
      (win.globalOnAddNode as (context: string, nodeId: string) => void)('before', id);
    }
  };

  const handleAddNodeAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : undefined;
    if (win && typeof win.globalOnAddNode === 'function') {
      (win.globalOnAddNode as (context: string, nodeId: string) => void)('after', id);
    }
  };

  // Status icon
  const StatusIcon = status === 'running' ? Loader2 :
                     status === 'success' ? CheckCircle :
                     status === 'error' ? XCircle :
                     Circle;

  // Action color from CSS design tokens
  const color = 'var(--workflow-node-action-hex)';
  
  // Get icon URL if available
  const iconUrl = data.iconUrl;
  const icon = data.icon;

  // Parse label to get brand and action
  const getBrandAndAction = () => {
    // Handle case where label might be an object
    const labelStr = typeof data.label === 'string' ? data.label : String(data.label);
    
    if (labelStr.includes(':')) {
      const parts = labelStr.split(':');
      return {
        brand: parts[0].trim(),
        action: parts.slice(1).join(':').trim()
      };
    }
    return {
      brand: data.category || 'Action',
      action: labelStr
    };
  };

  const { brand: _brand, action: _action } = getBrandAndAction();

  return (
    <div className="relative">
      {/* Main square node */}
      <div
        className={cn(
          'w-24 h-24 rounded-xl border-4 bg-background shadow-xl flex items-center justify-center relative',
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
          className="w-14 h-14 rounded-md flex items-center justify-center"
        >
          {iconUrl && typeof iconUrl === 'object' && 'light' in iconUrl && iconUrl.light ? (
            <Image
              src={getLucidL2IconUrl(iconUrl.light)}
              alt=""
              width={56}
              height={56}
              className="w-14 h-14 object-contain"
              unoptimized
            />
          ) : iconUrl && typeof iconUrl === 'string' ? (
            <Image
              src={getLucidL2IconUrl(iconUrl)}
              alt=""
              width={56}
              height={56}
              className="w-14 h-14 object-contain"
              unoptimized
            />
          ) : icon && typeof icon === 'string' && icon.startsWith('fa:') ? (
            <i className={`fa fa-${icon.replace('fa:', '')} text-2xl`} style={{ color }} />
          ) : (
            <span className="text-3xl" role="img" aria-label="action icon">
              ⚙️
            </span>
          )}
        </div>
      </div>

      {/* Brand and Action labels below node */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
        <div className="text-xs font-medium text-muted-foreground">
          {/* Show custom label, action name, or placeholder */}
          {(() => {
            const labelStr = typeof data.label === 'string' ? data.label : String(data.label);
            
            // Check if user has set a custom label (doesn't contain colon = custom)
            const hasCustomLabel = labelStr && !labelStr.includes(':');
            if (hasCustomLabel) {
              return labelStr; // Show custom label
            }
            
            // Check if action is selected (has colon)
            const hasAction = labelStr && labelStr.includes(':');
            if (hasAction) {
              const actionName = labelStr.split(':')[1]?.trim();
              // Show full action name (e.g., "Create a project")
              return actionName || 'Select an Action';
            }
            
            // No action selected - show placeholder
            return 'Select an Action';
          })()}
        </div>
        <div className="text-sm font-semibold">
          Do
        </div>
      </div>

      {/* Input Handle with "+" button */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center">
        {/* Plus button - only show if NOT connected */}
        {!hasIncomingConnection && (
          <>
            <button
              onClick={handleAddNodeBefore}
              className="absolute -left-14 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20 hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex items-center justify-center transition-all z-[9999] pointer-events-auto cursor-pointer shadow-md"
              title="Add node"
            >
              <Plus className="w-4 h-4 text-muted-foreground pointer-events-none" />
            </button>
            {/* Connecting line */}
            <div className="absolute -left-8 w-5 h-0.5 bg-muted-foreground/20" />
          </>
        )}
        {/* Handle */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-4 h-4 !bg-primary !-translate-x-1/2 !border-2 !border-background"
        />
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

ActionNode.displayName = 'ActionNode';
