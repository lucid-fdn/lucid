"use client";

import { useWorkspace } from '@/contexts/workspace-context';
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context';
import { WorkspaceNav } from './workspace-nav';
import { ProjectNav } from './project-nav';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Adaptive Sidebar Component
 * 
 * Automatically adapts based on:
 * - Feature flags (multiProject, multiEnv)
 * - Current workspace plan
 * - Current navigation context (workspace vs project)
 * 
 * Scales from simple workspace (MVP) to full hierarchy (Enterprise)
 * 
 * @example
 * ```tsx
 * <AdaptiveSidebar />
 * ```
 */
export function AdaptiveSidebar() {
  const { workspace, loading } = useWorkspace();
  const { multiProject } = useResolvedFeatureFlags();
  
  // Loading state
  if (loading) {
    return <SidebarSkeleton />;
  }
  
  // No workspace (shouldn't happen, but handle gracefully)
  if (!workspace) {
    return null;
  }
  
  // Determine which navigation to show
  // For MVP: Always show WorkspaceNav (simple mode)
  // For Pro+: Show WorkspaceNav with projects section
  // When in project: Show ProjectNav
  
  // Check if we're currently viewing a project
  // This would come from URL or context
  const currentProject = null; // TODO: Get from URL/context
  
  if (currentProject && multiProject) {
    return <ProjectNav project={currentProject} />;
  }
  
  return <WorkspaceNav />;
}

/**
 * Sidebar Loading Skeleton
 */
function SidebarSkeleton() {
  return (
    <div className="flex h-full w-64 flex-col gap-2 border-r bg-background p-4">
      {/* Workspace switcher skeleton */}
      <Skeleton className="h-10 w-full" />
      
      <div className="mt-4 space-y-2">
        {/* Nav items skeleton */}
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
