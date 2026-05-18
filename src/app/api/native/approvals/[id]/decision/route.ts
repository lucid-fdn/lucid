import { nativeApprovalDecisionInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { decideNativeApproval } from '@/lib/native/control-plane'
import { nativeApiError } from '../../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId()
    const { id } = await context.params
    const input = nativeApprovalDecisionInputSchema.parse(await request.json())
    return NextResponse.json(decideNativeApproval(userId, id, input))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/approvals/[id]/decision')
  }
}

