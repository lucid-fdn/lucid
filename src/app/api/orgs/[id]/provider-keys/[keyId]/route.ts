import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { getOrgMemberRole } from '@/lib/db'
import { deleteProviderKey, toggleProviderKey } from '@/lib/db/provider-keys'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

// DELETE /api/orgs/[id]/provider-keys/[keyId] — delete a provider key
export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await requireUserId()
    const { id: orgId, keyId } = (await (ctx as { params: Promise<{ id: string; keyId: string }> }).params)
    const role = await getOrgMemberRole(userId, orgId)
    if (!WRITE_ROLES.has(role ?? '')) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    await deleteProviderKey({ id: keyId, orgId, userId })

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      context: { operation: 'DELETE /api/orgs/[id]/provider-keys/[keyId]' },
    })
    return NextResponse.json(
      { error: 'Failed to delete provider key' },
      { status: 500 }
    )
  }
})

// PATCH /api/orgs/[id]/provider-keys/[keyId] — toggle active/inactive
export const PATCH = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await requireUserId()
    const { id: orgId, keyId } = (await (ctx as { params: Promise<{ id: string; keyId: string }> }).params)
    const role = await getOrgMemberRole(userId, orgId)
    if (!WRITE_ROLES.has(role ?? '')) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const { isActive } = await req.json()

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean' },
        { status: 400 }
      )
    }

    await toggleProviderKey({ id: keyId, orgId, isActive, userId })

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      context: { operation: 'PATCH /api/orgs/[id]/provider-keys/[keyId]' },
    })
    return NextResponse.json(
      { error: 'Failed to update provider key' },
      { status: 500 }
    )
  }
})
