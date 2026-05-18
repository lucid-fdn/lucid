import { nativeSessionHandoffInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { getServerSession } from '@/lib/auth/session'
import { createNativeSessionHandoff } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    const input = nativeSessionHandoffInputSchema.parse(await request.json())
    return NextResponse.json(createNativeSessionHandoff(input, request.nextUrl.origin, session.userId))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/session/handoff')
  }
}

