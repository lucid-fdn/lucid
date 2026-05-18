import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { getNativeApprovalDetail } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId()
    const { id } = await context.params
    return NextResponse.json(await getNativeApprovalDetail(userId, id))
  } catch (error) {
    return nativeApiError(error, 'GET /api/native/approvals/[id]')
  }
}
