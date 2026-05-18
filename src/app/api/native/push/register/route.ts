import { nativePushRegistrationInputSchema } from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { updateNativeDevice } from '@/lib/db/native-devices'
import { nativeApiError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = nativePushRegistrationInputSchema.parse(await request.json())
    const device = await updateNativeDevice(userId, input.deviceId, {
      pushProvider: input.provider,
      pushToken: input.token,
      notificationSettings: {
        topics: input.topics,
      },
    })
    return NextResponse.json({ device, topics: input.topics })
  } catch (error) {
    return nativeApiError(error, 'POST /api/native/push/register')
  }
}

