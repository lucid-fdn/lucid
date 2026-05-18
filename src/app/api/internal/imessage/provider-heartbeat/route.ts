import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  attachChannelProviderSurfaceToNode,
  upsertChannelProviderNode,
  verifyChannelProviderSurfaceToken,
} from '@/lib/db/channel-provider'
import { ErrorService } from '@/lib/errors/error-service'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const heartbeatSchema = z.object({
  surfaceId: z.string().uuid(),
  surfaceToken: z.string().min(1),
  nodeKey: z.string().min(1),
  label: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
  lastError: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyInternalAuth(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error || 'Authentication failed' }, { status: 401 })
    }

    const parsed = heartbeatSchema.safeParse(auth.body ? JSON.parse(auth.body) : null)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const surface = await verifyChannelProviderSurfaceToken({
      channelType: 'imessage',
      surfaceId: parsed.data.surfaceId,
      token: parsed.data.surfaceToken,
    })
    if (!surface) {
      return NextResponse.json({ error: 'Invalid hosted iMessage surface token' }, { status: 401 })
    }

    const node = await upsertChannelProviderNode({
      channelType: 'imessage',
      nodeKey: parsed.data.nodeKey,
      orgId: surface.org_id,
      label: parsed.data.label ?? null,
      version: parsed.data.version ?? null,
      capabilities: parsed.data.capabilities,
      status: parsed.data.status ?? 'active',
      lastError: parsed.data.lastError ?? null,
    })

    await attachChannelProviderSurfaceToNode({
      surfaceId: surface.id,
      nodeId: node.id,
      status: parsed.data.status === 'degraded' ? 'degraded' : 'connected',
    })

    return NextResponse.json({
      ok: true,
      nodeId: node.id,
      surfaceId: surface.id,
      status: parsed.data.status ?? 'active',
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/imessage/provider-heartbeat', method: 'POST' },
      tags: { layer: 'api', route: 'internal-imessage-provider-heartbeat' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
