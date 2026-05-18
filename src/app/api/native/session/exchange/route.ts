import { nativeSessionExchangeInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { exchangeNativeSessionHandoff } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const input = nativeSessionExchangeInputSchema.parse(await request.json())
    return NextResponse.json(await exchangeNativeSessionHandoff(input))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/session/exchange')
  }
}
