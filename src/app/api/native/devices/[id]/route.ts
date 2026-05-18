import {
  updateNativeDeviceInputSchema,
} from '@lucid/app-client'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requireUserId } from '@/lib/auth/session'
import {
  revokeNativeDevice,
  updateNativeDevice,
} from '@/lib/db/native-devices'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId()
    const { id } = await context.params
    const input = updateNativeDeviceInputSchema.parse(await request.json())
    const device = await updateNativeDevice(userId, id, input)
    return NextResponse.json({ device })
  } catch (error) {
    return nativeDeviceError(error, 'PATCH /api/native/devices/[id]')
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId()
    const { id } = await context.params
    await revokeNativeDevice(userId, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return nativeDeviceError(error, 'DELETE /api/native/devices/[id]')
  }
}

function nativeDeviceError(error: unknown, operation: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid native device payload', issues: error.issues }, { status: 400 })
  }

  if (error instanceof Error && error.name === 'AuthenticationError') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  ErrorService.captureException(error, {
    severity: 'error',
    context: { operation },
    tags: { layer: 'api', route: 'native-device' },
  })
  return NextResponse.json({ error: 'Failed to process native device request' }, { status: 500 })
}
