import { nativeSessionRevokeInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { revokeNativeSession } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = nativeSessionRevokeInputSchema.parse(await request.json())
    await revokeNativeSession(userId, input)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/session/revoke')
  }
}
