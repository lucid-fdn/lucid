import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ChannelAdminRouteError,
  createChannelAliasWithConflictCheck,
  deleteOwnedChannelAlias,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const createAliasSchema = z.object({
  chatId: z.string().min(1),
  alias: z
    .string()
    .trim()
    .min(1, 'Alias is required')
    .max(40, 'Alias must be 40 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Alias can only contain letters, numbers, spaces, dashes, and underscores.'),
})

const deleteAliasSchema = z.object({
  chatId: z.string().min(1),
  aliasId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireAssistantChannelAdminAccess(id)

    const parsed = createAliasSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const result = await createChannelAliasWithConflictCheck({
      assistantId: id,
      channelType: 'whatsapp',
      surfaceOwnerKind: 'chat',
      surfaceOwnerId: parsed.data.chatId,
      alias: parsed.data.alias,
    })
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.existingAssistantId === id
              ? `"${parsed.data.alias}" is already an alias for this agent.`
              : `"${parsed.data.alias}" is already used by another agent in this WhatsApp chat.`,
          conflict: { assistantId: result.existingAssistantId },
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ ok: true, alias: { id: result.alias.id, alias: result.alias.alias } })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-aliases', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-whatsapp-aliases' },
    })
    return NextResponse.json({ error: 'Failed to create WhatsApp alias.' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireAssistantChannelAdminAccess(id)

    const parsed = deleteAliasSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const deleted = await deleteOwnedChannelAlias({
      aliasId: parsed.data.aliasId,
      assistantId: id,
      channelType: 'whatsapp',
      surfaceOwnerKind: 'chat',
      surfaceOwnerId: parsed.data.chatId,
    })
    if (!deleted) {
      return NextResponse.json({ error: 'WhatsApp alias not found.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-aliases', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-whatsapp-aliases' },
    })
    return NextResponse.json({ error: 'Failed to delete WhatsApp alias.' }, { status: 500 })
  }
}
