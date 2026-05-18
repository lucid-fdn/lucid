import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  listTeamsChannelsForConversation,
  listTeamsChannelsForTenant,
  setPrimaryTeamsChannel,
} from '@/lib/db'
import {
  clearChannelSurfaceDefault,
  getChannelSurfaceDefaultBinding,
  setChannelSurfaceDefault,
} from '@/lib/db/channel-routing'
import {
  buildAssistantAliasMap,
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_conversation_default'),
    conversationId: z.string().min(1),
    bindingChannelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('set_tenant_default'),
    tenantId: z.string().min(1),
    assistantChannelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('clear_tenant_default'),
    tenantId: z.string().min(1),
  }),
])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const conversationId = request.nextUrl.searchParams.get('conversationId')?.trim() || ''
    const tenantId = request.nextUrl.searchParams.get('tenantId')?.trim() || ''

    if (!conversationId && !tenantId) {
      return NextResponse.json(
        { error: 'conversationId or tenantId is required' },
        { status: 400 },
      )
    }

    const [conversationBindings, tenantAgents] = await Promise.all([
      conversationId ? listTeamsChannelsForConversation(conversationId) : Promise.resolve([]),
      tenantId ? listTeamsChannelsForTenant(tenantId) : Promise.resolve([]),
    ])

    const foreignBinding = [...conversationBindings, ...tenantAgents].find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This Microsoft Teams tenant is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const scopedConversationBindings = conversationBindings.filter(
      (binding) => !binding.org_id || binding.org_id === assistant.org_id,
    )
    const scopedTenantAgents = tenantAgents.filter(
      (binding) => !binding.org_id || binding.org_id === assistant.org_id,
    )

    const assistantIds = Array.from(
      new Set(
        [...scopedConversationBindings, ...scopedTenantAgents].map((binding) => binding.assistant_id),
      ),
    )
    const aliasesByAssistantId =
      tenantId && assistantIds.length > 0
        ? await buildAssistantAliasMap({
            channelType: 'msteams',
            surfaceOwnerKind: 'tenant',
            surfaceOwnerId: tenantId,
            assistantIds,
          })
        : new Map<string, Array<{ id: string; alias: string }>>()

    const currentConversationBinding =
      scopedConversationBindings.find((binding) => binding.assistant_id === id) ?? null
    const defaultConversationBinding =
      scopedConversationBindings.find((binding) => binding.is_primary) ?? null
    const currentTenantBinding =
      scopedTenantAgents.find((binding) => binding.assistant_id === id) ?? null

    const surfaceDefault = tenantId
      ? await getChannelSurfaceDefaultBinding({
          channelType: 'msteams',
          surfaceOwnerKind: 'tenant',
          surfaceOwnerId: tenantId,
        })
      : null

    return NextResponse.json({
      conversationId: conversationId || null,
      tenantId: tenantId || null,
      bindings: scopedConversationBindings.map((binding) => ({
        assistantId: binding.assistant_id,
        assistantName: binding.assistant_name,
        assistantDescription: binding.assistant_description,
        bindingChannelId: binding.id,
        aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
        isDefault: binding.is_primary,
        isCurrentAssistant: binding.assistant_id === id,
      })),
      currentAssistant:
        currentConversationBinding || currentTenantBinding
          ? {
              assistantId: (currentConversationBinding ?? currentTenantBinding)!.assistant_id,
              assistantName: (currentConversationBinding ?? currentTenantBinding)!.assistant_name,
              bindingChannelId: (currentConversationBinding ?? currentTenantBinding)!.id,
              aliases:
                aliasesByAssistantId.get(
                  (currentConversationBinding ?? currentTenantBinding)!.assistant_id,
                ) ?? [],
              isDefault:
                currentConversationBinding?.is_primary === true ||
                surfaceDefault?.assistantId === id,
            }
          : null,
      defaultAssistant: defaultConversationBinding
        ? {
            assistantId: defaultConversationBinding.assistant_id,
            assistantName: defaultConversationBinding.assistant_name,
            bindingChannelId: defaultConversationBinding.id,
            aliases: aliasesByAssistantId.get(defaultConversationBinding.assistant_id) ?? [],
            isCurrentAssistant: defaultConversationBinding.assistant_id === id,
          }
        : null,
      surfaceDefault: surfaceDefault
        ? {
            assistantId: surfaceDefault.assistantId,
            assistantName:
              scopedTenantAgents.find((binding) => binding.assistant_id === surfaceDefault.assistantId)
                ?.assistant_name ?? 'Unknown agent',
            assistantChannelId: surfaceDefault.assistantChannelId,
            aliases: aliasesByAssistantId.get(surfaceDefault.assistantId) ?? [],
            isCurrentAssistant: surfaceDefault.assistantId === id,
          }
        : null,
      tenantAgents: scopedTenantAgents.map((binding) => ({
        assistantId: binding.assistant_id,
        assistantName: binding.assistant_name,
        assistantDescription: binding.assistant_description,
        bindingChannelId: binding.id,
        aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
        isCurrentAssistant: binding.assistant_id === id,
        isSurfaceDefault: surfaceDefault?.assistantId === binding.assistant_id,
        boundConversationId: binding.external_channel_id,
        isActive: binding.is_active,
        isConversationDefault: binding.is_primary,
      })),
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/msteams-admin', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-msteams-admin' },
    })
    return NextResponse.json(
      { error: 'Failed to load Microsoft Teams admin data.' },
      { status: 500 },
    )
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

    const data = parsed.data

    if (data.action === 'set_conversation_default') {
      const bindings = await listTeamsChannelsForConversation(data.conversationId)
      const foreignBinding = bindings.find(
        (binding) => binding.org_id && binding.org_id !== assistant.org_id,
      )
      if (foreignBinding) {
        return NextResponse.json(
          { error: 'This Microsoft Teams conversation is linked to another workspace and cannot be managed here.' },
          { status: 409 },
        )
      }

      const currentBinding = bindings.find(
        (binding) =>
          binding.id === data.bindingChannelId &&
          binding.assistant_id === id &&
          (!binding.org_id || binding.org_id === assistant.org_id),
      )
      if (!currentBinding) {
        return NextResponse.json(
          { error: 'This assistant is not bound to the Teams conversation you are trying to manage.' },
          { status: 409 },
        )
      }

      const switched = await setPrimaryTeamsChannel({
        conversationId: data.conversationId,
        channelId: data.bindingChannelId,
      })
      if (!switched) {
        return NextResponse.json(
          { error: 'Failed to update Microsoft Teams conversation default agent.' },
          { status: 409 },
        )
      }

      return NextResponse.json({ ok: true })
    }

    if (data.action === 'set_tenant_default') {
      const tenantAgents = await listTeamsChannelsForTenant(data.tenantId)
      const foreignBinding = tenantAgents.find(
        (binding) => binding.org_id && binding.org_id !== assistant.org_id,
      )
      if (foreignBinding) {
        return NextResponse.json(
          { error: 'This Microsoft Teams tenant is linked to another workspace and cannot be managed here.' },
          { status: 409 },
        )
      }

      const currentBinding = tenantAgents.find(
        (binding) =>
          binding.id === data.assistantChannelId &&
          binding.assistant_id === id &&
          (!binding.org_id || binding.org_id === assistant.org_id),
      )
      if (!currentBinding) {
        return NextResponse.json(
          { error: 'This assistant is not installed in the Teams tenant you are trying to manage.' },
          { status: 409 },
        )
      }

      const currentSurfaceDefault = await getChannelSurfaceDefaultBinding({
        channelType: 'msteams',
        surfaceOwnerKind: 'tenant',
        surfaceOwnerId: data.tenantId,
      })
      if (currentSurfaceDefault && currentSurfaceDefault.assistantId !== id) {
        return NextResponse.json(
          { error: 'Another assistant is already the Microsoft Teams tenant default. Disable it there before enabling this assistant.' },
          { status: 409 },
        )
      }

      await setChannelSurfaceDefault({
        channelType: 'msteams',
        surfaceOwnerKind: 'tenant',
        surfaceOwnerId: data.tenantId,
        assistantId: id,
        assistantChannelId: data.assistantChannelId,
      })
      return NextResponse.json({ ok: true })
    }

    const currentSurfaceDefault = await getChannelSurfaceDefaultBinding({
      channelType: 'msteams',
      surfaceOwnerKind: 'tenant',
      surfaceOwnerId: data.tenantId,
    })
    if (!currentSurfaceDefault || currentSurfaceDefault.assistantId !== id) {
      return NextResponse.json(
        { error: 'This assistant is not the Microsoft Teams tenant default.' },
        { status: 409 },
      )
    }

    await clearChannelSurfaceDefault({
      channelType: 'msteams',
      surfaceOwnerKind: 'tenant',
      surfaceOwnerId: data.tenantId,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/msteams-admin', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-msteams-admin' },
    })
    return NextResponse.json(
      { error: 'Failed to update Microsoft Teams admin settings.' },
      { status: 500 },
    )
  }
}
