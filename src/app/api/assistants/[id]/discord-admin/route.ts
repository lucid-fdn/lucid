import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  listDiscordChannelsForGuild,
  setPrimaryDiscordChannel,
} from '@/lib/db'
import {
  buildAssistantAliasMap,
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  guildId: z.string().min(1),
  assistantId: z.string().uuid(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const guildId = request.nextUrl.searchParams.get('guildId')?.trim() || ''
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 })
    }

    const bindings = await listDiscordChannelsForGuild(guildId)
    const foreignBinding = bindings.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This Discord server is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const scopedBindings = bindings.filter(
      (binding) => !binding.org_id || binding.org_id === assistant.org_id,
    )
    const aliasesByAssistantId = await buildAssistantAliasMap({
      channelType: 'discord',
      surfaceOwnerKind: 'guild',
      surfaceOwnerId: guildId,
      assistantIds: scopedBindings.map((binding) => binding.assistant_id),
    })

    const currentBinding = scopedBindings.find((binding) => binding.assistant_id === id) ?? null
    const defaultBinding = scopedBindings.find((binding) => binding.is_primary) ?? null

    return NextResponse.json({
      guildId,
      bindings: scopedBindings.map((binding) => ({
        assistantId: binding.assistant_id,
        assistantName: binding.assistant_name,
        assistantDescription: binding.assistant_description,
        bindingChannelId: binding.id,
        aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
        isDefault: binding.is_primary,
        isCurrentAssistant: binding.assistant_id === id,
      })),
      currentAssistant: currentBinding
        ? {
            assistantId: currentBinding.assistant_id,
            assistantName: currentBinding.assistant_name,
            bindingChannelId: currentBinding.id,
            aliases: aliasesByAssistantId.get(currentBinding.assistant_id) ?? [],
            isDefault: currentBinding.is_primary,
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
      context: { endpoint: '/api/assistants/[id]/discord-admin', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-discord-admin' },
    })
    return NextResponse.json({ error: 'Failed to load Discord admin data.' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    if (parsed.data.assistantId !== id) {
      return NextResponse.json(
        { error: 'You can only make the current assistant the guild default from this page.' },
        { status: 409 },
      )
    }

    const bindings = await listDiscordChannelsForGuild(parsed.data.guildId)
    const foreignBinding = bindings.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This Discord server is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const currentBinding = bindings.find((binding) => binding.assistant_id === id) ?? null
    if (!currentBinding) {
      return NextResponse.json(
        { error: 'This assistant is not bound to the Discord server you are trying to manage.' },
        { status: 409 },
      )
    }

    const result = await setPrimaryDiscordChannel(parsed.data.guildId, id, false)
    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to update Discord default agent.' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/discord-admin', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-discord-admin' },
    })
    return NextResponse.json({ error: 'Failed to update Discord default agent.' }, { status: 500 })
  }
}
