import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { ackRuntimeManagementCommand } from '@/lib/db/mission-control'
import { ackRuntimeManagementCommandSchema } from '@/lib/mission-control/schemas'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = ackRuntimeManagementCommandSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await ackRuntimeManagementCommand({
      runtimeId: runtime.id,
      commandId: parsed.data.commandId,
      status: parsed.data.status,
      response: parsed.data.response ?? null,
      error: parsed.data.error ?? null,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to acknowledge command' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/commands/ack POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
