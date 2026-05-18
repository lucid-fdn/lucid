import {
  registerNativeDeviceInputSchema,
} from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requireUserId } from '@/lib/auth/session'
import {
  listNativeDevices,
  registerNativeDevice,
} from '@/lib/db/native-devices'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireUserId()
    const devices = await listNativeDevices(userId)
    return NextResponse.json({ devices })
  } catch (error) {
    return nativeDevicesError(error, 'GET /api/native/devices')
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const input = registerNativeDeviceInputSchema.parse(await request.json())
    const device = await registerNativeDevice(userId, input)
    return NextResponse.json({ device }, { status: 201 })
  } catch (error) {
    return nativeDevicesError(error, 'POST /api/native/devices')
  }
}

function nativeDevicesError(error: unknown, operation: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid native device payload', issues: error.issues }, { status: 400 })
  }

  if (error instanceof Error && error.name === 'AuthenticationError') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (error instanceof Error && error.name === 'NativeDeviceAccessError') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  ErrorService.captureException(error, {
    severity: 'error',
    context: { operation },
    tags: { layer: 'api', route: 'native-devices' },
  })
  return NextResponse.json({ error: 'Failed to process native device request' }, { status: 500 })
}
