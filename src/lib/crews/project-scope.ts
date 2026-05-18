import 'server-only'

import { getPrimaryProjectForWorkspace } from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'

interface ResolveCrewProjectScopeInput {
  orgId: string
  projectId?: string | null
  endpoint: string
  userId?: string | null
}

export async function resolveCrewProjectScope({
  orgId,
  projectId,
  endpoint,
  userId,
}: ResolveCrewProjectScopeInput): Promise<string | null> {
  if (projectId) return projectId

  const fallbackProjectId = (await getPrimaryProjectForWorkspace(orgId))?.id ?? null
  if (fallbackProjectId) {
    ErrorService.captureException(new Error('Crew API used default project fallback'), {
      severity: 'warning',
      context: {
        code: 'crew.project_id_fallback',
        endpoint,
        orgId,
        resolvedProjectId: fallbackProjectId,
        userId: userId ?? undefined,
      },
      tags: { layer: 'api', route: 'crews' },
    })
  }

  return fallbackProjectId
}
