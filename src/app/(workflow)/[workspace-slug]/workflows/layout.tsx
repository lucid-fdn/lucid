/**
 * Workflows Layout (Server Component)
 * 
 * Follows same pattern as (app) layout:
 * 1. Server-side: Fetch workspace data with logo_url
 * 2. Server-side: Extract current workspace slug
 * 3. Pass data to client layout component
 */

import React from 'react';
import { getUserId } from '@/lib/auth/server-utils';
import { getUserWorkspaces } from '@/lib/workspace';
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log';
import { WorkflowsClientLayout } from './workflows-client-layout';

const DEBUG_WORKFLOWS_LAYOUT = process.env.DEBUG_WORKFLOWS_LAYOUT === 'true';

export default async function WorkflowsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ 'workspace-slug': string }>;
}) {
  // 1. Get user ID
  const userId = await getUserId();
  
  // 2. Get workspace slug from params
  const resolvedParams = await params;
  const currentWorkspaceSlug = resolvedParams['workspace-slug'];
  
  if (DEBUG_WORKFLOWS_LAYOUT) {
    console.debug('[workflows-layout] Server-side data:', {
      userId: maskIdentifier(userId),
      currentWorkspaceSlug,
    });
  }
  
  // 3. Fetch user workspaces (if authenticated)
  let userWorkspaces: Array<{
    id: string;
    slug: string;
    name: string;
    type: string;
    role: string;
    logo_url?: string;
    member_count?: number;
    plan_name?: string;
  }> = [];
  
  if (userId) {
    try {
      const workspaces = await getUserWorkspaces(userId);
      userWorkspaces = workspaces.map(ws => ({
        id: ws.id,
        slug: ws.slug,
        name: ws.name,
        type: ws.type,
        role: ws.role,
        logo_url: ws.logo_url,
        member_count: ws.member_count,
        plan_name: ws.plan_name
      }));
      
      if (DEBUG_WORKFLOWS_LAYOUT) console.debug('[workflows-layout] Fetched workspaces:', {
        count: userWorkspaces.length,
        hasLogos: userWorkspaces.some(w => w.logo_url)
      });
    } catch (error) {
      console.error('[workflows-layout] Failed to fetch workspaces:', summarizeError(error));
    }
  }
  
  // 4. Pass data to client layout
  return (
    <WorkflowsClientLayout
      userWorkspaces={userWorkspaces}
      currentWorkspaceSlug={currentWorkspaceSlug}
    >
      {children}
    </WorkflowsClientLayout>
  );
}
