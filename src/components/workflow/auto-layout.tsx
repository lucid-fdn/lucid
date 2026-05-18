'use client';

import { useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow } from 'reactflow';
import { autoLayoutNodes } from '@/lib/workflow/auto-layout';
import { useCanvasStore } from '@/stores/workflow/canvas.store';

interface AutoLayoutProps {
  enabled?: boolean;
}

/**
 * AutoLayout component
 * Automatically arranges nodes using ELK when they're first added/initialized
 * Prevents node overlaps and creates clean hierarchical layouts
 */
export function AutoLayout({ enabled = true }: AutoLayoutProps) {
  const nodesReady = useNodesInitialized();
  const { getNodes, setNodes, getEdges, fitView } = useReactFlow();
  const previousNodeCountRef = useRef(0);
  const { skipNextAutoLayout, setSkipNextAutoLayout } = useCanvasStore();

  useEffect(() => {
    if (!enabled || !nodesReady) {
      return;
    }

    const nodes = getNodes();
    const edges = getEdges();
    
    // Check if we should skip auto-layout (for manually positioned nodes)
    if (skipNextAutoLayout) {
      console.log('[AutoLayout] ⏭️  Skipping auto-layout (manual positioning)');
      setSkipNextAutoLayout(false); // Reset flag
      previousNodeCountRef.current = nodes.filter(n => n.id !== 'empty-state').length;
      return;
    }
    
    // Filter out empty-state node
    const realNodes = nodes.filter(n => n.id !== 'empty-state');
    
    // Only auto-layout if we have real nodes
    if (realNodes.length === 0) {
      previousNodeCountRef.current = 0;
      return;
    }

    // Check if node count changed (new node added)
    if (previousNodeCountRef.current === realNodes.length) {
      return; // No change, skip layout
    }

    // Update previous count
    previousNodeCountRef.current = realNodes.length;

    // Run layout
    (async () => {
      console.log('[AutoLayout] Running ELK layout...', realNodes.length, 'nodes');
      try {
        const layouted = await autoLayoutNodes(nodes, edges);
        setNodes(layouted);
        
        // Fit view after layout
        setTimeout(() => {
          fitView({ padding: 0.2, maxZoom: 1, duration: 300 });
        }, 50);
        
        console.log('[AutoLayout] Layout complete');
      } catch (error) {
        console.error('[AutoLayout] Layout failed:', error);
      }
    })();
  }, [nodesReady, enabled, getNodes, setNodes, getEdges, fitView, setSkipNextAutoLayout, skipNextAutoLayout]);

  return null; // This component doesn't render anything
}

/**
 * Manual layout trigger hook
 * Use this to trigger layout on demand (e.g., from a button)
 */
export function useManualLayout() {
  const { getNodes, setNodes, getEdges, fitView } = useReactFlow();

  const triggerLayout = async () => {
    const nodes = getNodes();
    const edges = getEdges();
    
    console.log('[useManualLayout] Triggering layout...');
    try {
      const layouted = await autoLayoutNodes(nodes, edges);
      setNodes(layouted);
      
      // Fit view after layout
      setTimeout(() => {
        fitView({ padding: 0.2, maxZoom: 1, duration: 300 });
      }, 50);
      
      console.log('[useManualLayout] Layout complete');
      return true;
    } catch (error) {
      console.error('[useManualLayout] Layout failed:', error);
      return false;
    }
  };

  return { triggerLayout };
}
