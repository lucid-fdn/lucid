import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { completeNativeSessionHandoff } from '@/lib/native/control-plane'
import { nativeApiError } from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId()
    const { id } = await context.params
    return NextResponse.json(await completeNativeSessionHandoff(userId, id))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/session/handoff/[id]/complete')
  }
}
