/**
 * React Flow ↔ FlowSpec Converter
 * 
 * Converts between React Flow's node/edge format and Lucid-L2's FlowSpec DSL
 * 
 * Storage Format: React Flow JSON (in Supabase)
 * Transport Format: FlowSpec DSL (to Lucid-L2)
 */

import type { Node, Edge } from 'reactflow';
import type { FlowSpec, FlowNode, FlowEdge, TriggerNode } from './types';

// ============================================================================
// React Flow → FlowSpec
// ============================================================================

/**
 * Convert React Flow format to FlowSpec DSL
 * 
 * This is called when saving/executing workflows to send to Lucid-L2
 * 
 * @param workflowName - Name of the workflow
 * @param nodes - React Flow nodes array
 * @param edges - React Flow edges array
 * @param variables - Optional workflow variables
 * @returns FlowSpec DSL object
 * 
 * @throws Error if no trigger node found
 * 
 * @example
 * ```typescript
 * const flowspec = reactFlowToFlowSpec(
 *   'My Workflow',
 *   reactFlowNodes,
 *   reactFlowEdges,
 *   { API_KEY: 'secret' }
 * );
 * ```
 */
export function reactFlowToFlowSpec(
  workflowName: string,
  nodes: Node[],
  edges: Edge[],
  variables?: Record<string, unknown>
): FlowSpec {
  console.log('[reactFlowToFlowSpec] Converting workflow:', {
    workflowName,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes: nodes.map(n => ({ id: n.id, type: n.type, nodeType: n.data?.nodeType, label: n.data?.label }))
  });

  // 1. Find trigger node (required - like n8n, Make, Zapier)
  // Note: Nodes have type:'custom' for React Flow, actual type is in data.type or data.nodeType
  const triggerNode = nodes.find(n => 
    n.type === 'trigger' || 
    n.data?.type === 'trigger' ||
    n.data?.nodeType === 'trigger'
  );

  console.log('[reactFlowToFlowSpec] Trigger node search:', {
    found: !!triggerNode,
    triggerNodeId: triggerNode?.id,
    triggerNodeType: triggerNode?.type,
    triggerNodeDataType: triggerNode?.data?.nodeType
  });

  if (!triggerNode) {
    console.error('[reactFlowToFlowSpec] No trigger node found! Nodes:', nodes);
    throw new Error(
      'Please add a trigger node to start your workflow. ' +
      'Triggers define how your workflow starts (manual, webhook, schedule, etc.)'
    );
  }

  // 2. Convert trigger node
  const trigger: TriggerNode = {
    type: triggerNode.data?.triggerType || 'manual',
    config: triggerNode.data?.config || {},
  };

  console.log('[reactFlowToFlowSpec] Trigger:', {
    type: trigger.type,
    config: trigger.config
  });

  // 3. Convert regular nodes (exclude trigger)
  const flowNodes: FlowNode[] = nodes
    .filter(n => n.id !== triggerNode.id)
    .map(node => ({
      id: node.id,
      type: node.type || 'action',
      params: node.data?.parameters || node.data || {},
      position: node.position,
    }));

  // 4. Build set of valid node IDs (for edge validation)
  const validNodeIds = new Set<string>(['trigger']);
  flowNodes.forEach(node => validNodeIds.add(node.id));

  // 5. Convert edges (filter out edges referencing non-existent nodes)
  const flowEdges: FlowEdge[] = edges
    .filter(edge => {
      const hasValidSource = validNodeIds.has(edge.source);
      const hasValidTarget = validNodeIds.has(edge.target);
      
      if (!hasValidSource || !hasValidTarget) {
        console.warn('[reactFlowToFlowSpec] Skipping invalid edge:', {
          from: edge.source,
          to: edge.target,
          reason: !hasValidSource ? 'source node not found' : 'target node not found'
        });
        return false;
      }
      
      return true;
    })
    .map(edge => ({
      from: edge.source,
      to: edge.target,
      condition: edge.data?.condition,
    }));

  // 6. Return FlowSpec
  const flowSpec = {
    name: workflowName,
    description: `Workflow created from LucidMerged`,
    trigger,
    nodes: flowNodes,
    edges: flowEdges,
    variables,
  };

  console.log('[reactFlowToFlowSpec] Generated FlowSpec:', JSON.stringify(flowSpec, null, 2));

  return flowSpec;
}

// ============================================================================
// FlowSpec → React Flow
// ============================================================================

/**
 * Convert FlowSpec DSL back to React Flow format
 * 
 * This is used when loading AI-generated workflows into the canvas
 * 
 * @param flowspec - FlowSpec DSL object
 * @returns Object with React Flow nodes and edges
 * 
 * @example
 * ```typescript
 * const { nodes, edges } = flowSpecToReactFlow(aiGeneratedFlowspec);
 * setNodes(nodes);
 * setEdges(edges);
 * ```
 */
export function flowSpecToReactFlow(
  flowspec: FlowSpec
): { nodes: Node[]; edges: Edge[] } {
  // 1. Convert trigger to React Flow node (if exists)
  const triggerNode: Node = {
    id: 'trigger',
    type: 'trigger',
    position: { x: 100, y: 100 },
    data: {
      nodeType: 'trigger',
      triggerType: flowspec.trigger?.type || 'manual',
      config: flowspec.trigger?.config || {},
      label: flowspec.trigger ? `Trigger: ${flowspec.trigger.type}` : 'Manual Trigger',
    },
  };

  // 2. Convert flow nodes to React Flow nodes
  const nodes: Node[] = [
    triggerNode,
    ...flowspec.nodes.map((node, index) => {
      // Handle both 'params' and 'config' from API
      const nodeData = node.params || node.config || {};
      
      return {
        id: node.id,
        type: node.type,
        position: node.position || { 
          // Auto-layout if no position provided
          x: 250 + (index * 200), 
          y: 100 + (Math.floor(index / 3) * 150)
        },
        data: {
          ...nodeData,
          nodeType: node.type,
          label: nodeData.label || `${node.type}`,
        },
      };
    }),
  ];

  // 3. Convert edges to React Flow edges
  const edges: Edge[] = flowspec.edges.map((edge, index) => ({
    id: `e${index}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: edge.condition ? 'conditional' : 'default',
    data: edge.condition ? { condition: edge.condition } : undefined,
    animated: true, // Visual feedback
  }));

  return { nodes, edges };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate React Flow nodes before conversion
 * 
 * @param nodes - React Flow nodes
 * @returns Array of validation errors (empty if valid)
 */
export function validateReactFlowNodes(nodes: Node[]): string[] {
  const errors: string[] = [];

  // Check for trigger node
  const hasTrigger = nodes.some(n => 
    n.type === 'trigger' || n.data?.nodeType === 'trigger'
  );
  
  if (!hasTrigger) {
    errors.push('Workflow must have at least one trigger node');
  }

  // Check for multiple triggers
  const triggerCount = nodes.filter(n => 
    n.type === 'trigger' || n.data?.nodeType === 'trigger'
  ).length;
  
  if (triggerCount > 1) {
    errors.push('Workflow cannot have multiple trigger nodes');
  }

  // Check for disconnected nodes
  const _nodeIds = new Set(nodes.map(n => n.id));
  nodes.forEach(node => {
    if (node.type !== 'trigger' && !node.data?.allowDisconnected) {
      // Node should have at least one connection
      // (This check would need edges parameter to fully validate)
    }
  });

  return errors;
}

/**
 * Validate FlowSpec before sending to Lucid-L2
 * 
 * @param flowspec - FlowSpec object
 * @returns Array of validation errors (empty if valid)
 */
export function validateFlowSpec(flowspec: FlowSpec): string[] {
  const errors: string[] = [];

  // Check required fields
  if (!flowspec.name || flowspec.name.trim().length === 0) {
    errors.push('Workflow name is required');
  }

  if (!flowspec.trigger) {
    errors.push('Trigger is required');
  }

  if (!flowspec.nodes || flowspec.nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  }

  // Validate trigger
  if (flowspec.trigger) {
    const validTriggerTypes = ['webhook', 'cron', 'manual'];
    if (!validTriggerTypes.includes(flowspec.trigger.type)) {
      errors.push(`Invalid trigger type: ${flowspec.trigger.type}`);
    }
  }

  // Validate nodes
  const nodeIds = new Set<string>();
  flowspec.nodes.forEach((node, index) => {
    if (!node.id) {
      errors.push(`Node at index ${index} is missing an ID`);
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  });

  // Validate edges
  flowspec.edges.forEach((edge, index) => {
    if (!edge.from) {
      errors.push(`Edge at index ${index} is missing 'from' field`);
    }
    if (!edge.to) {
      errors.push(`Edge at index ${index} is missing 'to' field`);
    }
    
    // Check if referenced nodes exist
    if (edge.from !== 'trigger' && !nodeIds.has(edge.from)) {
      errors.push(`Edge references non-existent node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references non-existent node: ${edge.to}`);
    }
  });

  return errors;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a React Flow node is a trigger
 * 
 * @param node - React Flow node
 * @returns true if node is a trigger
 */
export function isTriggerNode(node: Node): boolean {
  return node.type === 'trigger' || node.data?.nodeType === 'trigger';
}

/**
 * Check if FlowSpec is valid (basic check)
 * 
 * @param flowspec - FlowSpec object
 * @returns true if basic structure is valid
 */
export function isValidFlowSpec(flowspec: unknown): flowspec is FlowSpec {
  if (!flowspec || typeof flowspec !== 'object') return false;
  const fs = flowspec as Record<string, unknown>;
  return (
    typeof fs.name === 'string' &&
    !!fs.trigger &&
    Array.isArray(fs.nodes) &&
    Array.isArray(fs.edges)
  );
}
