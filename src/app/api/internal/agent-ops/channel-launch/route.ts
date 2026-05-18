import 'server-only'

import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
  buildAgentOpsChannelCommandUsage,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { ErrorService } from '@/lib/errors/error-service'
import { runChannelNativeActionChunks } from '@/lib/db/channel-native-actions'

export const dynamic = 'force-dynamic'

const AUTH_WINDOW_MS = 5 * 60_000

const launchSchema = z.object({
  channelType: z.string().min(1),
  channelLabel: z.string().min(1),
  surfaceId: z.string().min(1),
  externalUserId: z.string().min(1).nullable().optional(),
  rawCommandArg: z.string().optional().default(''),
  binding: z.object({
    assistant_id: z.string().min(1),
    org_id: z.string().nullable().optional(),
    assistant_name: z.string().nullable().optional(),
  }),
})

function verifyControlPlaneBridgeAuth(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  const requestId = request.headers.get('x-lucid-request-id')
  const timestamp = request.headers.get('x-lucid-timestamp')
  const signature = request.headers.get('x-lucid-signature')
  if (!requestId || !timestamp || !signature) return false

  const timestampMs = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(timestampMs)) return false
  if (Math.abs(Date.now() - timestampMs) > AUTH_WINDOW_MS) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${rawBody}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!verifyControlPlaneBridgeAuth(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let jsonBody: unknown
    try {
      jsonBody = JSON.parse(rawBody || '{}')
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsedBody = launchSchema.safeParse(jsonBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid Agent Ops channel launch payload' },
        { status: 400 },
      )
    }

    const command = parseChannelNativeCommand(parsedBody.data.rawCommandArg)
    if (!command) {
      return NextResponse.json(
        {
          error: 'Invalid channel command',
          report: buildAgentOpsChannelCommandUsage(parsedBody.data.channelLabel),
        },
        { status: 400 },
      )
    }

    const reportChunks = await runChannelNativeActionChunks({
      channelType: parsedBody.data.channelType,
      channelLabel: parsedBody.data.channelLabel,
      surfaceId: parsedBody.data.surfaceId,
      externalUserId: parsedBody.data.externalUserId ?? null,
      rawCommandArg: parsedBody.data.rawCommandArg,
      binding: parsedBody.data.binding,
    })

    return NextResponse.json({
      ok: true,
      report: reportChunks.join('\n'),
      reportChunks,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/agent-ops/channel-launch', method: 'POST' },
      tags: { layer: 'api', route: 'internal-agent-ops-channel-launch' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
