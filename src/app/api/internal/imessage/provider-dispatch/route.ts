import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  acknowledgeChannelProviderDispatch,
  claimNextChannelProviderDispatch,
  upsertChannelProviderNode,
  verifyChannelProviderSurfaceToken,
} from '@/lib/db/channel-provider'
import { ErrorService } from '@/lib/errors/error-service'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const claimSchema = z.object({
  action: z.literal('claim'),
  surfaceId: z.string().uuid(),
  surfaceToken: z.string().min(1),
  nodeKey: z.string().min(1),
  label: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
})

const ackSuccessSchema = z.object({
  action: z.literal('ack_success'),
  surfaceId: z.string().uuid(),
  surfaceToken: z.string().min(1),
  dispatchId: z.string().uuid(),
  externalMessageId: z.string().optional().nullable(),
})

const ackFailureSchema = z.object({
  action: z.literal('ack_failure'),
  surfaceId: z.string().uuid(),
  surfaceToken: z.string().min(1),
  dispatchId: z.string().uuid(),
  retryable: z.boolean().default(true),
  error: z.string().optional().nullable(),
})

const requestSchema = z.discriminatedUnion('action', [
  claimSchema,
  ackSuccessSchema,
  ackFailureSchema,
])

async function updateOutboundDeliveryMetadata(params: {
  outboundEventId: string
  externalMessageId?: string | null
  errorMessage?: string | null
}) {
  const supabase = createServiceClient()
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (params.externalMessageId !== undefined) {
    patch.external_message_id = params.externalMessageId
  }
  if (params.errorMessage !== undefined) {
    patch.last_error = params.errorMessage
  }

  await supabase
    .from('assistant_outbound_events')
    .update(patch)
    .eq('id', params.outboundEventId)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyInternalAuth(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error || 'Authentication failed' }, { status: 401 })
    }

    const parsed = requestSchema.safeParse(auth.body ? JSON.parse(auth.body) : null)
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

    if (parsed.data.action === 'claim') {
      const node = await upsertChannelProviderNode({
        channelType: 'imessage',
        nodeKey: parsed.data.nodeKey,
        orgId: surface.org_id,
        label: parsed.data.label ?? null,
        version: parsed.data.version ?? null,
      })
      const dispatch = await claimNextChannelProviderDispatch({
        channelType: 'imessage',
        surfaceId: surface.id,
        nodeId: node.id,
      })

      return NextResponse.json({
        ok: true,
        nodeId: node.id,
        dispatch,
      })
    }

    const supabase = createServiceClient()
    const { data: dispatch, error: dispatchError } = await supabase
      .from('channel_provider_dispatches')
      .select('id, assistant_outbound_event_id')
      .eq('id', parsed.data.dispatchId)
      .eq('surface_id', surface.id)
      .maybeSingle()

    if (dispatchError || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    if (parsed.data.action === 'ack_success') {
      await acknowledgeChannelProviderDispatch({
        dispatchId: parsed.data.dispatchId,
        status: 'delivered',
        externalMessageId: parsed.data.externalMessageId ?? null,
      })
      await updateOutboundDeliveryMetadata({
        outboundEventId: String(dispatch.assistant_outbound_event_id),
        externalMessageId: parsed.data.externalMessageId ?? null,
      })
      return NextResponse.json({ ok: true })
    }

    await acknowledgeChannelProviderDispatch({
      dispatchId: parsed.data.dispatchId,
      status: parsed.data.retryable ? 'retry' : 'failed',
      lastError: parsed.data.error ?? null,
    })
    await updateOutboundDeliveryMetadata({
      outboundEventId: String(dispatch.assistant_outbound_event_id),
      errorMessage: parsed.data.error ?? null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/imessage/provider-dispatch', method: 'POST' },
      tags: { layer: 'api', route: 'internal-imessage-provider-dispatch' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
