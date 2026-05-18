import 'server-only'

import { getOrgMemberRole, isUserOrgMember } from '@/lib/db'

const WRITE_ROLES = new Set(['owner', 'admin'])

export type KnowledgeManagerAccess =
  | { ok: true; role: string | null; canWrite: boolean }
  | { ok: false; status: 403; error: string }

export async function resolveKnowledgeManagerAccess(input: {
  userId: string
  orgId: string
  requireWrite?: boolean
}): Promise<KnowledgeManagerAccess> {
  if (!(await isUserOrgMember(input.userId, input.orgId))) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const role = await getOrgMemberRole(input.userId, input.orgId)
  const canWrite = Boolean(role && WRITE_ROLES.has(role))
  if (input.requireWrite && !canWrite) {
    return { ok: false, status: 403, error: 'Admin or owner role required' }
  }

  return { ok: true, role, canWrite }
}
