/**
 * Edge Type Registry
 * 
 * Centralized management system for workflow edge types.
 * Industry standard pattern for extensible edge systems.
 * 
 * Edge Types:
 * - custom: Standard edge with delete/insert capabilities
 * - conditional: (Future) Edge with condition labels
 * - animated: (Future) Animated edge for data flow
 * 
 * To add a new edge type:
 * 1. Create component in this directory
 * 2. Import and add to edgeTypes export
 * 3. Use the type when creating edges in workflow-editor
 * 
 * Architecture Benefits:
 * - Single source of truth for all edge types
 * - Easy to extend with new edge variations
 * - Type-safe with TypeScript
 * - Consistent with node registry pattern
 */

import { CustomEdge } from './custom-edge';
import type { EdgeTypes } from 'reactflow';

/**
 * Edge Types Registry
 * Maps edge type strings to their React components
 */
export const edgeTypes: EdgeTypes = {
  // Standard edge with hover controls (delete, insert node)
  custom: CustomEdge,
  
  // Future edge types:
  // conditional: ConditionalEdge,
  // animated: AnimatedEdge,
  // dataFlow: DataFlowEdge,
} as const;

/**
 * Edge type definitions for TypeScript
 */
export type WorkflowEdgeType = keyof typeof edgeTypes;

/**
 * Edge Data Interface
 * Defines the data structure passed to edge components
 */
export interface EdgeData {
  // Callback to delete this edge
  onDelete?: (edgeId: string) => void;
  
  // Callback to insert node in middle of edge
  onAddNode?: (sourceId: string, targetId: string, edgeId: string) => void;
  
  // Optional label for the edge
  label?: string;
  
  // Optional condition (for conditional edges)
  condition?: string;
  
  // Optional metadata
  [key: string]: unknown;
}

/**
 * Default edge configuration
 * Used when creating new edges
 */
export const defaultEdgeConfig = {
  type: 'custom' as WorkflowEdgeType,
  animated: true,
  style: {
    strokeWidth: 2,
  },
};

/**
 * Helper to create edge with default configuration
 */
export function createEdge(
  source: string,
  target: string,
  data?: EdgeData,
  type: WorkflowEdgeType = 'custom'
) {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...defaultEdgeConfig,
    type,
    data: {
      ...data,
    },
  };
}

/**
 * Helper to create edge with specific target handle
 * Used for AI Agent nodes with multiple input handles
 */
export function createEdgeWithHandle(
  source: string,
  target: string,
  targetHandle: string,
  data?: EdgeData,
  type: WorkflowEdgeType = 'custom'
) {
  return {
    ...createEdge(source, target, data, type),
    targetHandle,
  };
}

// Re-export components for direct imports if needed
export { CustomEdge };

/**
 * Usage Examples:
 * 
 * Basic edge:
 * ```typescript
 * const edge = createEdge('node1', 'node2', {
 *   onDelete: handleDelete,
 *   onAddNode: handleAddNode
 * });
 * ```
 * 
 * Edge with specific handle (for AI Agent):
 * ```typescript
 * const edge = createEdgeWithHandle('llm-node', 'agent-node', 'model', {
 *   onDelete: handleDelete
 * });
 * ```
 * 
 * Using edge types in React Flow:
 * ```typescript
 * import { edgeTypes } from '@/components/workflow/edges';
 * 
 * <ReactFlow
 *   edgeTypes={edgeTypes}
 *   defaultEdgeOptions={{ type: 'custom', animated: true }}
 * />
 * ```
 */
