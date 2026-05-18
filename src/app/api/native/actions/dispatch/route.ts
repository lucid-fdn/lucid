import { nativeActionDispatchInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { recordNativeActionReceipt } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = nativeActionDispatchInputSchema.parse(await request.json())
    return NextResponse.json(await recordNativeActionReceipt(userId, input))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/actions/dispatch')
  }
}
