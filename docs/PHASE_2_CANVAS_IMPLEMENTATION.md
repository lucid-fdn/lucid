# Phase 2: Canvas & Nodes Implementation

**Date:** October 17, 2025  
**Status:** In Progress  
**Timeline:** Weeks 3-4 (2 weeks)

---

## Overview

Phase 2 focuses on integrating React Flow to create a visual workflow canvas where users can:
- Add nodes to the canvas
- Connect nodes together
- Drag and position nodes
- Zoom and pan the canvas
- Configure node properties

---

## Goals

### Week 3: Basic Canvas
- [x] Phase 1 Complete
- [ ] Create workflow editor page with React Flow
- [ ] Implement canvas store (Zustand)
- [ ] Add basic node types
- [ ] Implement drag and drop
- [ ] Add zoom/pan controls

### Week 4: Node System
- [ ] Create node palette/library
- [ ] Implement node configuration panel
- [ ] Add connection validation
- [ ] Implement node deletion
- [ ] Add canvas save/load
- [ ] Style nodes to match app theme

---

## Architecture

### React Flow Integration

React Flow is the perfect choice because:
- Same creators as Vue Flow (used in n8n)
- Mature, well-documented library
- Built-in features: zoom, pan, mini-map, controls
- Customizable nodes and edges
- TypeScript support
- 50k+ weekly downloads

### Store Structure

```typescript
// Canvas Store (Zustand)
interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  selectedNode: string | null
  viewport: { x: number; y: number; zoom: number }
  
  // Actions
  addNode: (node: Node) => void
  updateNode: (id: string, data: any) => void
  deleteNode: (id: string) => void
  addEdge: (edge: Edge) => void
  deleteEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void
  setViewport: (viewport: Viewport) => void
}
```

### Component Hierarchy

```
WorkflowEditor
├── Canvas (React Flow)
│   ├── CustomNode (x N)
│   ├── Edge (x N)
│   ├── MiniMap
│   ├── Controls
│   └── Background
├── NodePalette
│   └── NodeCategory[]
│       └── NodeItem[]
└── NodeConfigPanel
    └── NodeForm
```

---

## Implementation Steps

### Step 1: Install React Flow

```bash
npm install reactflow@11.10.4
```

Already done in Phase 1! ✅

### Step 2: Create Canvas Store

```typescript
// stores/workflow/canvas.store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Node, Edge, Viewport } from 'reactflow';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  viewport: Viewport;
  
  // Node actions
  addNode: (node: Node) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  
  // Edge actions
  addEdge: (edge: Edge) => void;
  deleteEdge: (id: string) => void;
  
  // Selection
  setSelectedNode: (id: string | null) => void;
  
  // Viewport
  setViewport: (viewport: Viewport) => void;
  
  // Bulk operations
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  reset: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      
      addNode: (node) =>
        set((state) => {
          state.nodes.push(node);
        }),
      
      updateNode: (id, updates) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === id);
          if (node) {
            Object.assign(node, updates);
          }
        }),
      
      deleteNode: (id) =>
        set((state) => {
          state.nodes = state.nodes.filter((n) => n.id !== id);
          state.edges = state.edges.filter(
            (e) => e.source !== id && e.target !== id
          );
          if (state.selectedNodeId === id) {
            state.selectedNodeId = null;
          }
        }),
      
      addEdge: (edge) =>
        set((state) => {
          state.edges.push(edge);
        }),
      
      deleteEdge: (id) =>
        set((state) => {
          state.edges = state.edges.filter((e) => e.id !== id);
        }),
      
      setSelectedNode: (id) => set({ selectedNodeId: id }),
      
      setViewport: (viewport) => set({ viewport }),
      
      setNodes: (nodes) => set({ nodes }),
      
      setEdges: (edges) => set({ edges }),
      
      reset: () =>
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
    })),
    { name: 'canvas-store' }
  )
);
```

### Step 3: Create Basic Node Types

```typescript
// lib/workflow/node-types.ts
export interface NodeData {
  label: string;
  type: string;
  config?: Record<string, any>;
}

export const NODE_TYPES = {
  trigger: {
    label: 'Trigger',
    color: '#10b981', // green
    icon: 'Zap',
  },
  action: {
    label: 'Action',
    color: '#3b82f6', // blue
    icon: 'Play',
  },
  condition: {
    label: 'Condition',
    color: '#f59e0b', // amber
    icon: 'GitBranch',
  },
  transform: {
    label: 'Transform',
    color: '#8b5cf6', // purple
    icon: 'Repeat',
  },
} as const;

export type NodeType = keyof typeof NODE_TYPES;
```

### Step 4: Create Custom Node Component

```tsx
// components/workflow/nodes/custom-node.tsx
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import * as Icons from 'lucide-react';
import { NODE_TYPES, type NodeData } from '@/lib/workflow/node-types';

export const CustomNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const nodeConfig = NODE_TYPES[data.type as keyof typeof NODE_TYPES];
  const Icon = Icons[nodeConfig.icon as keyof typeof Icons] as any;

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 bg-background shadow-lg min-w-[200px]',
        selected ? 'border-primary' : 'border-border',
        'hover:shadow-xl transition-all'
      )}
      style={{
        borderLeftColor: nodeConfig.color,
        borderLeftWidth: '4px',
      }}
    >
      {/* Input Handle */}
      {data.type !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 !bg-primary"
        />
      )}

      {/* Node Content */}
      <div className="flex items-center gap-2">
        <div
          className="p-2 rounded"
          style={{ backgroundColor: `${nodeConfig.color}20` }}
        >
          {Icon && <Icon className="w-4 h-4" style={{ color: nodeConfig.color }} />}
        </div>
        <div>
          <div className="font-semibold text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">{nodeConfig.label}</div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-primary"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
```

### Step 5: Create Workflow Canvas Component

```tsx
// components/workflow/canvas/workflow-canvas.tsx
'use client';

import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { CustomNode } from '../nodes/custom-node';
import { useCanvasStore } from '@/stores/workflow/canvas.store';

const nodeTypes = {
  custom: CustomNode,
};

export function WorkflowCanvas() {
  const { nodes: storeNodes, edges: storeEdges, addEdge: storeAddEdge } = useCanvasStore();
  
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        id: `${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        type: 'smoothstep',
      };
      setEdges((eds) => addEdge(edge, eds));
      storeAddEdge(edge);
    },
    [setEdges, storeAddEdge]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

### Step 6: Create Workflow Editor Page

```tsx
// app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx
'use client';

import { WorkflowCanvas } from '@/components/workflow/canvas/workflow-canvas';
import { Button } from '@/components/ui/button';
import { Play, Save } from 'lucide-react';

export default function WorkflowEditorPage() {
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">My Workflow</h2>
          <p className="text-sm text-muted-foreground">Last saved 5 minutes ago</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button size="sm">
            <Play className="h-4 w-4 mr-2" />
            Execute
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <WorkflowCanvas />
      </div>
    </div>
  );
}
```

---

## Node Palette

Create a draggable node palette:

```tsx
// components/workflow/palette/node-palette.tsx
'use client';

import { NODE_TYPES } from '@/lib/workflow/node-types';
import { Button } from '@/components/ui/button';
import * as Icons from 'lucide-react';
import { useCanvasStore } from '@/stores/workflow/canvas.store';

export function NodePalette() {
  const { addNode } = useCanvasStore();

  const handleAddNode = (type: string) => {
    const nodeConfig = NODE_TYPES[type as keyof typeof NODE_TYPES];
    const newNode = {
      id: `${type}-${Date.now()}`,
      type: 'custom',
      position: { x: 250, y: 250 },
      data: {
        label: `New ${nodeConfig.label}`,
        type,
      },
    };
    addNode(newNode);
  };

  return (
    <div className="p-4 border-r bg-background w-64">
      <h3 className="font-semibold mb-4">Add Nodes</h3>
      <div className="space-y-2">
        {Object.entries(NODE_TYPES).map(([type, config]) => {
          const Icon = Icons[config.icon as keyof typeof Icons] as any;
          return (
            <Button
              key={type}
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAddNode(type)}
            >
              <Icon className="h-4 w-4 mr-2" style={{ color: config.color }} />
              {config.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Testing Checklist

### Canvas Functionality
- [ ] Canvas renders without errors
- [ ] Can add nodes from palette
- [ ] Can drag nodes around
- [ ] Can connect nodes
- [ ] Can delete nodes
- [ ] Can delete connections
- [ ] Zoom in/out works
- [ ] Pan works
- [ ] MiniMap shows
- [ ] Controls show

### Node Functionality
- [ ] Nodes render correctly
- [ ] Node selection works
- [ ] Node hover states work
- [ ] Handles appear correctly
- [ ] Node colors match types
- [ ] Icons display correctly

### Store Integration
- [ ] Nodes sync with store
- [ ] Edges sync with store
- [ ] Selection syncs with store
- [ ] Store DevTools work

---

## Styling Guidelines

### Theme Integration

Match your app's theme:
```css
/* React Flow custom styles */
.react-flow__node {
  @apply bg-background border-border;
}

.react-flow__edge {
  @apply stroke-primary;
}

.react-flow__handle {
  @apply bg-primary border-primary;
}

.react-flow__controls {
  @apply bg-background border-border shadow-lg;
}

.react-flow__minimap {
  @apply bg-background border-border;
}
```

---

## Success Criteria

Phase 2 is complete when:
- [ ] Canvas renders and works
- [ ] Can add all node types
- [ ] Can connect nodes
- [ ] Can move nodes
- [ ] Zoom/pan works
- [ ] Store syncs properly
- [ ] No console errors
- [ ] Matches app theme
- [ ] Responsive layout
- [ ] Mobile-friendly (basic)

---

## Next: Phase 3

Once Phase 2 is complete, we'll move to:
- API integration
- Workflow CRUD
- Execution engine
- Real-time updates

---

**Let's build the canvas!** 🎨
