import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ChannelAdminRouteError,
  createChannelAliasWithConflictCheck,
  deleteOwnedChannelAlias,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getHostedSlackInstallForAssistant,
  listHostedSlackWorkspaceAgents,
} from '@/lib/slack/hosted-bindings'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const createAliasSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1, 'Alias is required')
    .max(40, 'Alias must be 40 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Alias can only contain letters, numbers, spaces, dashes, and underscores.'),
})

const deleteAliasSchema = z.object({
  aliasId: z.string().uuid(),
})

async function requireSlackInstallForAssistant(assistantId: string) {
  const supabase = createServiceClient()
  const install = await getHostedSlackInstallForAssistant(supabase, assistantId)
  if (!install || !install.teamId) {
    return { supabase, install: null }
  }
  return { supabase, install }
}

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

    const { supabase, install } = await requireSlackInstallForAssistant(id)
    if (!install || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const result = await createChannelAliasWithConflictCheck({
      assistantId: id,
      channelType: 'slack',
      surfaceOwnerKind: 'team',
      surfaceOwnerId: install.teamId,
      alias: parsed.data.alias,
    })

    if (!result.ok) {
      const workspaceAgents = await listHostedSlackWorkspaceAgents(supabase, install.teamId)
      const owner = workspaceAgents.find((agent) => agent.assistantId === result.existingAssistantId) ?? null
      return NextResponse.json(
        {
          error:
            owner && owner.assistantId === id
              ? `"${parsed.data.alias}" is already an alias for this agent.`
              : owner
                ? `"${parsed.data.alias}" is already used by ${owner.assistantName}.`
                : `"${parsed.data.alias}" is already used in this Slack workspace.`,
          conflict: owner
            ? {
                assistantId: owner.assistantId,
                assistantName: owner.assistantName,
              }
            : null,
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      ok: true,
      alias: {
        id: result.alias.id,
        alias: result.alias.alias,
      },
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-aliases', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-slack-aliases' },
    })
    return NextResponse.json({ error: 'Failed to create Slack alias.' }, { status: 500 })
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

    const { install } = await requireSlackInstallForAssistant(id)
    if (!install || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const deleted = await deleteOwnedChannelAlias({
      aliasId: parsed.data.aliasId,
      assistantId: id,
      channelType: 'slack',
      surfaceOwnerKind: 'team',
      surfaceOwnerId: install.teamId,
    })
    if (!deleted) {
      return NextResponse.json({ error: 'Slack alias not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-aliases', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-slack-aliases' },
    })
    return NextResponse.json({ error: 'Failed to delete Slack alias.' }, { status: 500 })
  }
}
