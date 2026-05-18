import type { Node, Edge } from 'reactflow';

interface ELKNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ELKNode[];
}

interface ELKInstance {
  layout(graph: Record<string, unknown>): Promise<{
    children?: ELKNode[];
  }>;
}

interface NodeWithMeasured extends Node {
  measured?: { width?: number; height?: number };
}

let elkInstance: ELKInstance | null = null;

async function getELK(): Promise<ELKInstance> {
  if (!elkInstance) {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
    elkInstance = new ELK() as ELKInstance;
  }
  return elkInstance;
}

// Default node dimensions (will be overridden with actual measurements)
const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 160;

export interface LayoutOptions {
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeSpacing?: number;
}

/**
 * Group definition for compound layout.
 * Each group becomes a parent ELK node with its members as children.
 */
export interface LayoutGroup {
  id: string;
  /** IDs of child nodes that belong inside this group */
  children: string[];
  /** Width of the group node (ELK will auto-size based on children, but needs minimum) */
  width?: number;
  /** Height of the group node */
  height?: number;
  /** Padding inside the group container */
  padding?: number;
}

/**
 * Auto-layout workflow nodes using ELK (Eclipse Layout Kernel)
 * Prevents node overlaps and creates clean, hierarchical layouts.
 *
 * When `groups` is provided, builds a compound graph where group nodes
 * contain their children. ELK returns absolute positions — child positions
 * are post-processed to be relative to their parent (required by ReactFlow parentNode).
 */
export async function autoLayoutNodes(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
  groups?: LayoutGroup[],
): Promise<Node[]> {
  const {
    direction = 'RIGHT', // Left-to-right (trigger → actions)
    nodeSpacing = 60,     // Space between nodes at same level
    layerSpacing = 100,   // Space between layers (trigger → action → action)
    edgeSpacing = 30,     // Space between edges
  } = options;

  // Skip if no nodes
  if (nodes.length === 0) {
    return nodes;
  }

  // Filter out empty-state node
  const realNodes = nodes.filter(n => n.id !== 'empty-state');

  if (realNodes.length === 0) {
    return nodes;
  }

  // Create a Set of valid node IDs for fast lookup
  const validNodeIds = new Set(realNodes.map(n => n.id));

  // Filter edges to only include those that reference existing nodes
  const validEdges = edges.filter(e => {
    const sourceExists = validNodeIds.has(e.source);
    const targetExists = validNodeIds.has(e.target);

    if (!sourceExists || !targetExists) {
      console.warn('[auto-layout] Skipping edge with missing node reference:', {
        edge: e.id,
        source: e.source,
        sourceExists,
        target: e.target,
        targetExists
      });
      return false;
    }

    return true;
  });

  // Build ELK graph (compound or flat)
  const layoutOptions: Record<string, string> = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
    'elk.spacing.edgeNode': String(edgeSpacing),
    'elk.spacing.edgeEdge': String(edgeSpacing),
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  };

  let graph: Record<string, unknown>;

  if (groups && groups.length > 0) {
    // ─── Compound graph mode ───
    layoutOptions['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN';

    // Build child membership map: nodeId → groupId
    const childToGroup = new Map<string, string>();
    for (const g of groups) {
      for (const childId of g.children) {
        childToGroup.set(childId, g.id);
      }
    }

    // Build group ELK children
    const groupChildren = groups.map(g => {
      const padding = g.padding ?? 40;
      return {
        id: g.id,
        width: g.width ?? 280,
        height: g.height ?? 160,
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': direction,
          'elk.spacing.nodeNode': String(nodeSpacing),
          'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
          'elk.padding': `[top=${padding + 30},left=${padding},bottom=${padding},right=${padding}]`,
        },
        children: g.children
          .filter(cid => validNodeIds.has(cid))
          .map(cid => {
            const n = realNodes.find(nd => nd.id === cid)!;
            return {
              id: n.id,
              width: (n as NodeWithMeasured).measured?.width ?? n.width ?? DEFAULT_NODE_WIDTH,
              height: (n as NodeWithMeasured).measured?.height ?? n.height ?? DEFAULT_NODE_HEIGHT,
            };
          }),
      };
    });

    // Ungrouped nodes (not in any group)
    const ungroupedNodes = realNodes
      .filter(n => !childToGroup.has(n.id) && !groups.some(g => g.id === n.id))
      .map(n => ({
        id: n.id,
        width: (n as NodeWithMeasured).measured?.width ?? n.width ?? DEFAULT_NODE_WIDTH,
        height: (n as NodeWithMeasured).measured?.height ?? n.height ?? DEFAULT_NODE_HEIGHT,
      }));

    graph = {
      id: 'root',
      layoutOptions,
      children: [...groupChildren, ...ungroupedNodes],
      edges: validEdges.map(e => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };
  } else {
    // ─── Flat graph mode (original) ───
    graph = {
      id: 'root',
      layoutOptions,
      children: realNodes.map((n) => ({
        id: n.id,
        width: (n as NodeWithMeasured).measured?.width ?? n.width ?? DEFAULT_NODE_WIDTH,
        height: (n as NodeWithMeasured).measured?.height ?? n.height ?? DEFAULT_NODE_HEIGHT,
      })),
      edges: validEdges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };
  }

  try {
    // Run ELK layout
    const elk = await getELK();
    const layouted = await elk.layout(graph);

    if (groups && groups.length > 0) {
      // ─── Compound post-processing ───
      // ELK returns absolute positions. ReactFlow parentNode expects
      // child positions relative to parent. Convert here.
      const positionMap = new Map<string, { x: number; y: number }>();
      const sizeMap = new Map<string, { width: number; height: number }>();

      for (const groupNode of layouted.children ?? []) {
        positionMap.set(groupNode.id, { x: groupNode.x ?? 0, y: groupNode.y ?? 0 });
        sizeMap.set(groupNode.id, {
          width: groupNode.width ?? 280,
          height: groupNode.height ?? 160,
        });

        // Process children within group nodes
        if (groupNode.children) {
          const parentX = groupNode.x ?? 0;
          const parentY = groupNode.y ?? 0;

          for (const child of groupNode.children) {
            // Critical: convert absolute → parent-relative
            positionMap.set(child.id, {
              x: (child.x ?? 0),
              y: (child.y ?? 0),
            });
          }
        }
      }

      // Map positions back to nodes
      const positioned = realNodes.map((node) => {
        const pos = positionMap.get(node.id);
        const size = sizeMap.get(node.id);

        if (pos) {
          return {
            ...node,
            position: pos,
            ...(size ? { width: size.width, height: size.height, style: { width: size.width, height: size.height } } : {}),
          };
        }

        return node;
      });

      return positioned;
    }

    // ─── Flat post-processing (original) ───
    const positioned = realNodes.map((node) => {
      const elkNode = layouted.children?.find((c) => c.id === node.id);

      if (elkNode) {
        return {
          ...node,
          position: {
            x: elkNode.x ?? node.position.x,
            y: elkNode.y ?? node.position.y,
          },
        };
      }

      return node;
    });

    return positioned;
  } catch (error) {
    console.error('[auto-layout] ELK layout failed:', error);
    // Return original nodes if layout fails
    return realNodes;
  }
}

/**
 * Calculate bounding box of all nodes
 */
export function getNodesBounds(nodes: Node[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    const nodeWidth = (node as NodeWithMeasured).measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const nodeHeight = (node as NodeWithMeasured).measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
