import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { listNativeInbox } from '@/lib/native/control-plane'
import { nativeApiError } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireUserId()
    return NextResponse.json(await listNativeInbox(userId))
  } catch (error) {
    return nativeApiError(error, 'GET /api/native/inbox')
  }
}
