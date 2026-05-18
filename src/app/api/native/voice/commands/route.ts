import { nativeVoiceCommandInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { createNativeVoiceCommand } from '@/lib/native/control-plane'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = nativeVoiceCommandInputSchema.parse(await request.json())
    return NextResponse.json(createNativeVoiceCommand(userId, input))
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/voice/commands')
  }
}

