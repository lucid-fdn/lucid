import 'server-only'

import { getOrgMemberRole } from '@/lib/db'
import { AgentCommerceError } from './errors'

export interface AgentCommerceOrgAccess {
  role: string
}

export function canWriteAgentCommerce(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export async function requireAgentCommerceOrgMembership(
  userId: string,
  orgId: string,
): Promise<AgentCommerceOrgAccess> {
  const role = await getOrgMemberRole(userId, orgId)
  if (!role) {
    throw new AgentCommerceError('forbidden', 'Organization membership required.', 403)
  }
  return { role }
}

export async function requireAgentCommerceOrgWriteAccess(
  userId: string,
  orgId: string,
): Promise<AgentCommerceOrgAccess> {
  const { role } = await requireAgentCommerceOrgMembership(userId, orgId)
  if (!canWriteAgentCommerce(role)) {
    throw new AgentCommerceError('forbidden', 'Admin or owner role required.', 403)
  }
  return { role }
}
