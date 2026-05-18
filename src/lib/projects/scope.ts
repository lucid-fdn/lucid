import 'server-only'

import { cache } from 'react'
import { getWorkspaceWithAccess, type WorkspaceWithAccess } from '@/lib/workspace'
import {
  getPrimaryProjectForWorkspace,
  getProjectBySlugForWorkspace,
  type ProjectRecord,
} from '@/lib/db/projects'

export interface WorkspaceProjectScope {
  workspace: WorkspaceWithAccess
  project: ProjectRecord
}

export const resolveWorkspaceProjectScope = cache(async (
  workspaceSlug: string,
  userId: string,
  projectSlug?: string | null,
): Promise<WorkspaceProjectScope | null> => {
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const project = projectSlug
    ? await getProjectBySlugForWorkspace(workspace.id, projectSlug)
    : await getPrimaryProjectForWorkspace(workspace.id)

  if (!project) return null

  return { workspace, project }
})
