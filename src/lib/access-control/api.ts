import 'server-only'

import { NextResponse } from 'next/server'

import { type RolePermissions } from './types'
import { getAssistant } from '@/lib/db'
import { requireOrgRequestContext } from '@/lib/request-context/org'

type AccessDenied = { ok: false; response: NextResponse }
type OrgAccessGranted = { ok: true; orgId: string }
type AssistantAccessGranted = {
  ok: true
  orgId: string
  assistant: NonNullable<Awaited<ReturnType<typeof getAssistant>>>
}

export async function requireOrgPermission(
  userId: string,
  orgId: string,
  permission: keyof RolePermissions,
): Promise<OrgAccessGranted | AccessDenied> {
  const context = await requireOrgRequestContext({ userId, orgId, permission })
  if (!context.ok) {
    return context
  }

  if (context.context.userId !== userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, orgId }
}

export async function requireAssistantPermission(
  userId: string,
  assistantId: string,
  permission: keyof RolePermissions,
): Promise<AssistantAccessGranted | AccessDenied> {
  const assistant = await getAssistant(assistantId)
  if (!assistant) {
    return { ok: false, response: NextResponse.json({ error: 'Assistant not found' }, { status: 404 }) }
  }

  const access = await requireOrgPermission(userId, assistant.org_id, permission)
  if (!access.ok) {
    return access
  }

  return { ok: true, orgId: assistant.org_id, assistant }
}
