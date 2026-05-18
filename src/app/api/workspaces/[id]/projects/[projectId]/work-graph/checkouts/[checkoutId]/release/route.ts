import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { releaseWorkItemCheckout } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

const releaseSchema = z.object({
  status: z.enum(['released', 'cancelled', 'completed']).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; checkoutId: string }> },
) {
  const { id: orgId, projectId, checkoutId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = releaseSchema.parse(await request.json().catch(() => ({})))
  const checkout = await releaseWorkItemCheckout(
    orgId,
    checkoutId,
    body.status ?? 'released',
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!checkout || checkout.project_id !== projectId) {
    return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })
  }
  return NextResponse.json({ checkout })
}
