import { NextRequest, NextResponse } from 'next/server'
import { WorkItemCheckoutCreateSchema } from '@contracts/work-graph'

import { createWorkItemCheckout } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkItemCheckoutCreateSchema.parse(await request.json())
  const result = await createWorkItemCheckout(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (result.error === 'not_found') return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
  if (result.error === 'claim_failed') return NextResponse.json({ error: 'Work item claim failed' }, { status: 409 })
  if (!result.checkout) return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  return NextResponse.json({ checkout: result.checkout }, { status: 201 })
}

