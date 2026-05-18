import { NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspace, setWorkspaceScope } from '@/lib/db'
import { getDefaultEnvironmentForProject, getProjectByIdForWorkspace } from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/workspace
 * 
 * Fetches complete workspace scope: org + project + env
 * Used by WorkspaceProvider to initialize context
 * 
 * Query params:
 * - org_id: Organization ID to load
 * 
 * Returns:
 * {
 *   org: { id, name, slug },
 *   project: { id, name, slug, is_default },
 *   env: { id, name, is_default },
 *   favorites: [{ id, name, url, ... }]
 * }
 */
export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('org_id')
    const requestedProjectId = searchParams.get('project_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    // Fetch workspace using db helper
    const workspace = await getWorkspace(userId, orgId)
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    let resolvedWorkspace = workspace

    if (
      requestedProjectId
      && workspace.project?.id !== requestedProjectId
    ) {
      const knownProject = workspace.projects?.find((item) => item.id === requestedProjectId)
      const [project, env] = await Promise.all([
        getProjectByIdForWorkspace(workspace.org.id, requestedProjectId),
        getDefaultEnvironmentForProject(requestedProjectId),
      ])

      if (project && env) {
        resolvedWorkspace = {
          ...workspace,
          project: {
            id: project.id,
            org_id: project.org_id,
            name: project.name,
            slug: project.slug,
            is_default: project.is_default,
            agent_count: knownProject?.agent_count ?? 0,
          },
          env: {
            id: env.id,
            name: env.name as 'production' | 'development' | 'staging',
            is_default: env.is_default,
          },
        }
      }
    }

    // Set workspace scope for this session (transaction-local)
    // This makes all subsequent queries in this request properly scoped
    if (resolvedWorkspace.project?.id && resolvedWorkspace.env?.id) {
      await setWorkspaceScope(
        resolvedWorkspace.org.id,
        resolvedWorkspace.project.id,
        resolvedWorkspace.env.id
      )
    }

    return NextResponse.json(resolvedWorkspace)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workspace/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
