import { memo, useState } from 'react';
import { 
  BaseEdge, 
  EdgeLabelRenderer, 
  getSmoothStepPath,
  type EdgeProps 
} from 'reactflow';
import { X, Plus } from 'lucide-react';

export const CustomEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
  source,
  target,
}: EdgeProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    console.log('[CustomEdge] Delete button clicked, edge ID:', id);
    console.log('[CustomEdge] data.onDelete exists?', !!data?.onDelete);
    
    // Call delete function from data
    if (data?.onDelete) {
      console.log('[CustomEdge] Calling data.onDelete()');
      data.onDelete(id);
    } else {
      console.error('[CustomEdge] onDelete function not found in data!');
    }
  };

  const onAddNode = (event: React.MouseEvent) => {
    event.stopPropagation();
    console.log('[CustomEdge] Add node button clicked');
    console.log('[CustomEdge] Source:', source, 'Target:', target);
    
    // Call add node function with edge context
    if (data?.onAddNode) {
      console.log('[CustomEdge] Calling data.onAddNode()');
      data.onAddNode(source, target, id);
    } else {
      console.error('[CustomEdge] onAddNode function not found in data!');
    }
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: selected || isHovered ? 3 : 2,
          stroke: selected ? '#3b82f6' : isHovered ? '#6b7280' : '#9ca3af',
        }}
      />
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center gap-2"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Add Node Button */}
          <button
            onClick={onAddNode}
            className={`w-6 h-6 rounded-full bg-background border-2 border-primary/50 hover:border-primary hover:bg-accent flex items-center justify-center transition-all shadow-md ${
              isHovered || selected ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'
            }`}
            title="Insert node"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
          </button>

          {/* Delete Edge Button */}
          <button
            onClick={onEdgeDelete}
            className={`w-6 h-6 rounded-full bg-background border-2 border-red-500/50 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950 flex items-center justify-center transition-all shadow-md ${
              isHovered || selected ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'
            }`}
            title="Delete connection"
          >
            <X className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

CustomEdge.displayName = 'CustomEdge';
