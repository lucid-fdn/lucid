import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listTeamsChannelsForTenant } from '@/lib/db'
import {
  ChannelAdminRouteError,
  createChannelAliasWithConflictCheck,
  deleteOwnedChannelAlias,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const createAliasSchema = z.object({
  tenantId: z.string().min(1),
  alias: z
    .string()
    .trim()
    .min(1, 'Alias is required')
    .max(40, 'Alias must be 40 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Alias can only contain letters, numbers, spaces, dashes, and underscores.'),
})

const deleteAliasSchema = z.object({
  tenantId: z.string().min(1),
  aliasId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const parsed = createAliasSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const tenantAgents = await listTeamsChannelsForTenant(parsed.data.tenantId)
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
      (binding) => binding.assistant_id === id && (!binding.org_id || binding.org_id === assistant.org_id),
    )
    if (!currentBinding) {
      return NextResponse.json(
        { error: 'This assistant is not installed in the Teams tenant you are trying to manage.' },
        { status: 409 },
      )
    }

    const result = await createChannelAliasWithConflictCheck({
      assistantId: id,
      channelType: 'msteams',
      surfaceOwnerKind: 'tenant',
      surfaceOwnerId: parsed.data.tenantId,
      alias: parsed.data.alias,
    })
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.existingAssistantId === id
              ? `"${parsed.data.alias}" is already an alias for this agent.`
              : `"${parsed.data.alias}" is already used by another agent in this Microsoft Teams tenant.`,
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
      context: { endpoint: '/api/assistants/[id]/msteams-aliases', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-msteams-aliases' },
    })
    return NextResponse.json(
      { error: 'Failed to create Microsoft Teams alias.' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const parsed = deleteAliasSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const tenantAgents = await listTeamsChannelsForTenant(parsed.data.tenantId)
    const foreignBinding = tenantAgents.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This Microsoft Teams tenant is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const deleted = await deleteOwnedChannelAlias({
      aliasId: parsed.data.aliasId,
      assistantId: id,
      channelType: 'msteams',
      surfaceOwnerKind: 'tenant',
      surfaceOwnerId: parsed.data.tenantId,
    })
    if (!deleted) {
      return NextResponse.json({ error: 'Microsoft Teams alias not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/msteams-aliases', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-msteams-aliases' },
    })
    return NextResponse.json(
      { error: 'Failed to delete Microsoft Teams alias.' },
      { status: 500 },
    )
  }
}
