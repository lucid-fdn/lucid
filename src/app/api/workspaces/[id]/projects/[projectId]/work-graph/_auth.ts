import { NextResponse } from 'next/server'

import { requireOrgPermission } from '@/lib/access-control/api'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { isFeatureEnabled, isWorkGraphKillSwitchActive } from '@/lib/features'

export async function requireWorkGraphReadAccess(orgId: string, projectId: string) {
  if (isWorkGraphKillSwitchActive() || !isFeatureEnabled('workGraph')) {
    return { ok: false as const, response: NextResponse.json({ error: 'Work Graph is disabled' }, { status: 404 }) }
  }

  const userId = await getUserId()
  if (!userId) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const project = await getProjectByIdForWorkspace(orgId, projectId)
  if (!project) return { ok: false as const, response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  return { ok: true as const, userId, project }
}

export async function requireWorkGraphWriteAccess(orgId: string, projectId: string) {
  const read = await requireWorkGraphReadAccess(orgId, projectId)
  if (!read.ok) return read

  const access = await requireOrgPermission(read.userId, orgId, 'editProjects')
  if (!access.ok) return { ok: false as const, response: access.response }

  return read
}
