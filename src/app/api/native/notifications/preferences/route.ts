import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'

import { requireUserId } from '@/lib/auth/session'
import {
  listNativeDevices,
  updateNativeDevice,
} from '@/lib/db/native-devices'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const updatePreferencesSchema = z
  .object({
    deviceId: z.string().uuid(),
    notificationSettings: z.record(z.string(), z.unknown()),
  })
  .strict()

export async function GET() {
  try {
    const userId = await requireUserId()
    const devices = await listNativeDevices(userId)
    return NextResponse.json({
      devices: devices.map((device) => ({
        id: device.id,
        appKind: device.appKind,
        platform: device.platform,
        notificationSettings: device.notificationSettings,
      })),
    })
  } catch (error) {
    return notificationPreferencesError(error, 'GET /api/native/notifications/preferences')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = updatePreferencesSchema.parse(await request.json())
    const device = await updateNativeDevice(userId, input.deviceId, {
      notificationSettings: input.notificationSettings,
    })

    return NextResponse.json({
      device: {
        id: device.id,
        appKind: device.appKind,
        platform: device.platform,
        notificationSettings: device.notificationSettings,
      },
    })
  } catch (error) {
    return notificationPreferencesError(error, 'PATCH /api/native/notifications/preferences')
  }
}

function notificationPreferencesError(error: unknown, operation: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid notification preferences payload', issues: error.issues }, { status: 400 })
  }

  if (error instanceof Error && error.name === 'AuthenticationError') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  ErrorService.captureException(error, {
    severity: 'error',
    context: { operation },
    tags: { layer: 'api', route: 'native-notification-preferences' },
  })
  return NextResponse.json({ error: 'Failed to process native notification preferences request' }, { status: 500 })
}
