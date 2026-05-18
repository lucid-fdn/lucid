/**
 * React Flow ↔ n8n Converter
 * Converts between our workflow format and n8n's format
 * Features: Multi-output support, semantic hashing
 */

import crypto from 'crypto';
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  N8nWorkflow,
  N8nNode,
  N8nConnections,
  N8nWorkflowSettings,
} from '../../types';
import { getNodeMapping, getNodeTypeVersion } from './node-registry';

// ============================================================================
// React Flow → n8n Conversion
// ============================================================================

/**
 * Convert React Flow workflow to n8n format
 */
export function reactFlowToN8n(
  name: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options?: {
    active?: boolean;
    settings?: N8nWorkflowSettings;
  }
): N8nWorkflow {
  const n8nNodes: N8nNode[] = [];
  const n8nConnections: N8nConnections = {};

  // Convert nodes
  for (const node of nodes) {
    const n8nNode = convertNodeToN8n(node);
    n8nNodes.push(n8nNode);
  }

  // Build connections with multi-output support
  const connections = buildConnections(edges, nodes);
  Object.assign(n8nConnections, connections);

  return {
    name,
    active: options?.active ?? true,
    nodes: n8nNodes,
    connections: n8nConnections,
    settings: options?.settings || {
      executionOrder: 'v1',
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'all',
      saveExecutionProgress: false,
      saveManualExecutions: true,
    },
    staticData: undefined,
  };
}

/**
 * Convert single React Flow node to n8n node
 */
function convertNodeToN8n(node: WorkflowNode): N8nNode {
  const mapping = getNodeMapping(node.type);

  // Map parameters
  const parameters = mapping.mapParams(node.data);

  // Map credentials if needed
  const credentials = mapping.mapCredentials
    ? mapping.mapCredentials(node.data)
    : undefined;

  return {
    id: node.id,
    name: (node.data.label as string) || mapping.defaultName,
    type: mapping.n8nType,
    typeVersion: mapping.version,
    position: [node.position.x, node.position.y],
    parameters,
    credentials,
    disabled: node.metadata?.disabled || false,
    notes: node.metadata?.description || undefined,
  };
}

/**
 * Build n8n connections from React Flow edges
 * Supports multi-output (IF/Switch nodes)
 */
function buildConnections(
  edges: WorkflowEdge[],
  _nodes: WorkflowNode[]
): N8nConnections {
  const connections: N8nConnections = {};

  // Group edges by source
  for (const edge of edges) {
    const sourceId = edge.source;
    const targetId = edge.target;

    // Get output index from sourceHandle (e.g., "main:0", "main:1")
    const outputIndex = getOutputIndex(edge.sourceHandle);

    // Initialize connections for source
    if (!connections[sourceId]) {
      connections[sourceId] = { main: [] };
    }

    // Initialize array for this output index
    if (!connections[sourceId].main[outputIndex]) {
      connections[sourceId].main[outputIndex] = [];
    }

    // Add connection
    connections[sourceId].main[outputIndex].push({
      node: targetId,
      type: 'main',
      index: 0, // Input index (usually 0)
    });
  }

  return connections;
}

/**
 * Extract output index from sourceHandle
 * Format: "main:0", "main:1", etc.
 */
function getOutputIndex(handle?: string): number {
  if (!handle) return 0;
  
  const parts = handle.split(':');
  if (parts.length > 1) {
    const index = parseInt(parts[1], 10);
    return isNaN(index) ? 0 : index;
  }
  
  return 0;
}

// ============================================================================
// n8n → React Flow Conversion
// ============================================================================

/**
 * Convert n8n workflow to React Flow format
 */
export function n8nToReactFlow(n8nWorkflow: N8nWorkflow): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Convert nodes
  for (const n8nNode of n8nWorkflow.nodes) {
    const node = convertN8nNodeToReactFlow(n8nNode);
    nodes.push(node);
  }

  // Convert connections to edges
  const connectionEdges = buildEdgesFromConnections(n8nWorkflow.connections);
  edges.push(...connectionEdges);

  return { nodes, edges };
}

/**
 * Convert single n8n node to React Flow node
 */
function convertN8nNodeToReactFlow(n8nNode: N8nNode): WorkflowNode {
  // Find our node type from n8n type
  // This is a reverse lookup - simplified for now
  const nodeType = inferNodeType(n8nNode.type);

  return {
    id: n8nNode.id,
    type: nodeType,
    position: {
      x: n8nNode.position[0],
      y: n8nNode.position[1],
    },
    data: {
      label: n8nNode.name,
      ...n8nNode.parameters,
    },
    metadata: {
      label: n8nNode.name,
      description: n8nNode.notes,
      disabled: n8nNode.disabled,
    },
  };
}

/**
 * Infer our node type from n8n type
 */
function inferNodeType(n8nType: string): string {
  const typeMap: Record<string, string> = {
    'n8n-nodes-base.webhook': 'trigger.webhook',
    'n8n-nodes-base.cron': 'trigger.cron',
    'n8n-nodes-base.if': 'control.if',
    'n8n-nodes-base.switch': 'control.switch',
    'n8n-nodes-base.merge': 'control.merge',
    'n8n-nodes-base.splitInBatches': 'control.split',
    'n8n-nodes-base.httpRequest': 'data.http',
    'n8n-nodes-base.set': 'data.set',
    'n8n-nodes-base.openAi': 'ai.chat',
    'n8n-nodes-base.emailSend': 'integration.email',
    'n8n-nodes-base.postgres': 'integration.postgres',
  };

  return typeMap[n8nType] || 'unknown';
}

/**
 * Build React Flow edges from n8n connections
 */
function buildEdgesFromConnections(connections: N8nConnections): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];

  for (const [sourceId, connection] of Object.entries(connections)) {
    if (!connection.main) continue;

    // Iterate through output indexes
    connection.main.forEach((outputConnections, outputIndex) => {
      if (!outputConnections) return;

      for (const conn of outputConnections) {
        edges.push({
          id: `${sourceId}-${conn.node}-${outputIndex}`,
          source: sourceId,
          target: conn.node,
          sourceHandle: outputIndex > 0 ? `main:${outputIndex}` : undefined,
        });
      }
    });
  }

  return edges;
}

// ============================================================================
// Semantic Hashing (Drift Detection)
// ============================================================================

/**
 * Compute content hash for drift detection
 * Only includes semantic fields (excludes id, name, position, metadata)
 */
export function computeContentHash(workflow: N8nWorkflow): string {
  const canonical = canonicalizeWorkflow(workflow);
  const normalized = stableStringify(canonical);
  
  return crypto
    .createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex');
}

/**
 * Extract only semantic fields for hashing
 */
function canonicalizeWorkflow(workflow: N8nWorkflow): Record<string, unknown> {
  return {
    nodes: workflow.nodes.map((node) => ({
      type: node.type,
      typeVersion: node.typeVersion,
      parameters: node.parameters,
      credentials: node.credentials || undefined,
    })),
    connections: workflow.connections || {},
  };
}

/**
 * Stable JSON stringify (deterministic key order)
 */
function stableStringify(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(stableStringify);
    return `[${items.join(',')}]`;
  }

  // Sort keys for deterministic output
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map((key) => {
    const value = stableStringify(record[key]);
    return `${JSON.stringify(key)}:${value}`;
  });

  return `{${pairs.join(',')}}`;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate React Flow workflow before conversion
 */
export function validateWorkflow(workflow: Workflow): string[] {
  const errors: string[] = [];

  // Check for nodes
  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  }

  // Validate each node
  for (const node of workflow.nodes) {
    try {
      const mapping = getNodeMapping(node.type);
      if (mapping.validate) {
        const nodeErrors = mapping.validate(node.data);
        errors.push(...nodeErrors.map((e) => `Node ${node.id}: ${e}`));
      }
    } catch (error: unknown) {
      errors.push(`Node ${node.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Validate edges
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id}: Source node ${edge.source} not found`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id}: Target node ${edge.target} not found`);
    }
  }

  return errors;
}

/**
 * Compare two workflow hashes to detect drift
 */
export function hasDrift(hash1: string, hash2: string): boolean {
  return hash1 !== hash2;
}

// ============================================================================
// Node Version Tracking
// ============================================================================

/**
 * Extract node type versions from workflow
 */
export function extractNodeTypeVersions(
  workflow: Workflow
): Record<string, number> {
  const versions: Record<string, number> = {};

  for (const node of workflow.nodes) {
    if (!versions[node.type]) {
      try {
        versions[node.type] = getNodeTypeVersion(node.type);
      } catch {
        // Node type not found, skip
      }
    }
  }

  return versions;
}
