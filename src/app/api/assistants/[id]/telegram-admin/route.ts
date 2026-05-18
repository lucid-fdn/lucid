import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getTelegramChatScope,
  listTelegramChannelsForChat,
  setPrimaryTelegramChannel,
} from '@/lib/db'
import {
  buildAssistantAliasMap,
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  chatId: z.string().min(1),
  assistantId: z.string().uuid(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireAssistantChannelAdminAccess(id)

    const chatId = request.nextUrl.searchParams.get('chatId')?.trim() || ''
    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
    }

    const bindings = await listTelegramChannelsForChat(chatId)
    const scope = await getTelegramChatScope(chatId)
    const aliasesByAssistantId = scope
      ? await buildAssistantAliasMap({
          channelType: 'telegram',
          surfaceOwnerKind: 'org',
          surfaceOwnerId: scope.orgId,
          assistantIds: bindings.map((binding) => binding.assistant_id),
        })
      : new Map<string, Array<{ id: string; alias: string }>>()

    const currentBinding = bindings.find((binding) => binding.assistant_id === id) ?? null
    const defaultBinding = bindings.find((binding) => binding.is_primary) ?? null

    return NextResponse.json({
      chatId,
      orgId: scope?.orgId ?? null,
      bindings: bindings.map((binding) => ({
        assistantId: binding.assistant_id,
        assistantName: binding.assistant_name,
        assistantDescription: binding.assistant_description,
        bindingChannelId: binding.id,
        aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
        isDefault: binding.is_primary,
        isCurrentAssistant: binding.assistant_id === id,
        roleTitle: binding.assistant_role_title,
        essence: binding.assistant_essence,
      })),
      currentAssistant: currentBinding
        ? {
            assistantId: currentBinding.assistant_id,
            assistantName: currentBinding.assistant_name,
            bindingChannelId: currentBinding.id,
            aliases: aliasesByAssistantId.get(currentBinding.assistant_id) ?? [],
            isDefault: currentBinding.is_primary,
            roleTitle: currentBinding.assistant_role_title,
            essence: currentBinding.assistant_essence,
          }
        : null,
      defaultAssistant: defaultBinding
        ? {
            assistantId: defaultBinding.assistant_id,
            assistantName: defaultBinding.assistant_name,
            bindingChannelId: defaultBinding.id,
            aliases: aliasesByAssistantId.get(defaultBinding.assistant_id) ?? [],
            isCurrentAssistant: defaultBinding.assistant_id === id,
          }
        : null,
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/telegram-admin', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-telegram-admin' },
    })
    return NextResponse.json({ error: 'Failed to load Telegram admin data.' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireAssistantChannelAdminAccess(id)

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    if (parsed.data.assistantId !== id) {
      return NextResponse.json(
        { error: 'You can only make the current assistant the Telegram chat default from this page.' },
        { status: 409 },
      )
    }

    const result = await setPrimaryTelegramChannel(parsed.data.chatId, id, false)
    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to update Telegram default agent.' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/telegram-admin', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-telegram-admin' },
    })
    return NextResponse.json({ error: 'Failed to update Telegram default agent.' }, { status: 500 })
  }
}
