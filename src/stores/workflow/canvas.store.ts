import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Node, Edge, Viewport } from 'reactflow';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  viewport: Viewport;
  skipNextAutoLayout: boolean; // Flag to skip auto-layout for manually positioned nodes
  
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
  
  // Auto-layout control
  setSkipNextAutoLayout: (skip: boolean) => void;
  
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
      skipNextAutoLayout: false,
      
      addNode: (node) => {
        set((state) => {
          console.log('[CanvasStore] Adding node:', { id: node.id, type: node.type, data: node.data })
          
          // Remove empty-state node when adding first real node
          const emptyStateIndex = state.nodes.findIndex(n => n.id === 'empty-state')
          if (emptyStateIndex !== -1) {
            console.log('[CanvasStore] Removing empty-state node')
            state.nodes.splice(emptyStateIndex, 1)
          }
          
          state.nodes.push(node);
          console.log('[CanvasStore] Total nodes after add:', state.nodes.length)
        });
        
        // Auto-select with longer delay to ensure all React updates complete
        // This includes modal closing animations and React Flow updates
        setTimeout(() => {
          set((state) => {
            const nodeExists = state.nodes.find(n => n.id === node.id);
            if (nodeExists) {
              state.selectedNodeId = node.id;
              console.log('[CanvasStore] ✅ Auto-selected new node:', node.id)
              console.log('[CanvasStore] Current selectedNodeId:', state.selectedNodeId)
            } else {
              console.error('[CanvasStore] ❌ Node not found for selection:', node.id)
            }
          });
        }, 100);
      },
      
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
      
      setSkipNextAutoLayout: (skip) => set({ skipNextAutoLayout: skip }),
      
      setNodes: (nodes) => set({ nodes }),
      
      setEdges: (edges) => set({ edges }),
      
      reset: () =>
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          skipNextAutoLayout: false,
        }),
    })),
    { name: 'canvas-store' }
  )
);

// Selectors
export const selectNodes = (state: CanvasState) => state.nodes;
export const selectEdges = (state: CanvasState) => state.edges;
export const selectSelectedNodeId = (state: CanvasState) => state.selectedNodeId;
