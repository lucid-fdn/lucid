import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  clearChannelSurfaceDefault,
  getChannelSurfaceDefaultBinding,
  setChannelSurfaceDefault,
} from '@/lib/db/channel-routing'
import {
  DEFAULT_HOSTED_SLACK_ACK_REACTION,
  DEFAULT_HOSTED_SLACK_TYPING_REACTION,
  bindHostedSlackAssistantToConversation,
  getHostedSlackActivitySnapshot,
  getHostedSlackInstallForAssistant,
  listHostedSlackWorkspaceAgents,
  listHostedSlackBindingsForAssistant,
  listSlackHostedConversations,
  listSlackHostedUsers,
  normalizeHostedSlackAckReaction,
  normalizeHostedSlackRoutingConfig,
  normalizeHostedSlackAllowedUserIds,
  normalizeHostedSlackReplyToMode,
  normalizeHostedSlackStreamingMode,
  normalizeHostedSlackNativeStreaming,
  normalizeHostedSlackStreamingPreview,
  normalizeHostedSlackWorkspaceWideEnabled,
  normalizeHostedSlackThreadHistoryScope,
  normalizeHostedSlackThreadInitialHistoryLimit,
  normalizeHostedSlackThreadInheritParent,
  normalizeHostedSlackTypingReaction,
  unbindHostedSlackAssistantFromConversation,
  updateHostedSlackRoutingConfig,
} from '@/lib/slack/hosted-bindings'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const bindSchema = z.object({
  conversationId: z.string().min(1).max(64),
  conversationLabel: z.string().trim().min(1).max(200).optional(),
  conversationType: z.enum(['public', 'private', 'mpim', 'im']).optional(),
})

const unbindSchema = z.object({
  assistantChannelId: z.string().uuid().optional(),
})

const hostedSlackPrefixSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  })
  .refine((value) => value === null || value.length <= 32, {
    message: 'Prefix must be 32 characters or less',
  })
  .refine((value) => value === null || !value.includes(' '), {
    message: 'Prefix must not contain spaces',
  })

const routingConfigSchema = z
  .object({
    assistantChannelId: z.string().uuid().optional(),
    dedicated_channel: z.boolean().optional(),
    prefix: hostedSlackPrefixSchema,
    respond_on_mention: z.boolean().optional(),
    thread_support: z.boolean().optional(),
    ignore_bots: z.boolean().optional(),
    streamingPreview: z.boolean().optional(),
    streamingMode: z.enum(['off', 'partial', 'block', 'progress']).optional(),
    nativeStreaming: z.boolean().optional(),
    threadHistoryScope: z.enum(['thread', 'channel']).optional(),
    threadInheritParent: z.boolean().optional(),
    threadInitialHistoryLimit: z.number().int().min(0).nullable().optional(),
    replyToMode: z.enum(['off', 'first', 'all']).optional(),
    workspaceWideEnabled: z.boolean().optional(),
    allowedUsers: z
      .union([z.array(z.string()), z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (Array.isArray(value)) {
          return value
            .map((entry) => entry.trim().replace(/^<@([^>]+)>$/, '$1'))
            .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
        }
        if (typeof value === 'string') {
          return value
            .split(/[\n,]/)
            .map((entry) => entry.trim().replace(/^<@([^>]+)>$/, '$1'))
            .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
        }
        return undefined
      }),
    typingReaction: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') return value ?? undefined
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
      })
      .refine(
        (value) =>
          value === undefined ||
          value === null ||
          (/^[a-z0-9_+-]+$/i.test(value) && !value.includes(':')),
        {
          message: 'Typing reaction must be a Slack emoji name without surrounding colons.',
        },
      ),
    ackReaction: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') return value ?? undefined
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
      })
      .refine(
        (value) =>
          value === undefined ||
          value === null ||
          (/^[a-z0-9_+-]+$/i.test(value) && !value.includes(':')),
        {
          message: 'Ack reaction must be a Slack emoji name without surrounding colons.',
        },
      ),
  })
  .refine(
    (value) =>
      value.dedicated_channel !== undefined ||
      value.prefix !== undefined ||
      value.respond_on_mention !== undefined ||
      value.thread_support !== undefined ||
      value.ignore_bots !== undefined ||
      value.streamingPreview !== undefined ||
      value.streamingMode !== undefined ||
      value.nativeStreaming !== undefined ||
      value.threadHistoryScope !== undefined ||
      value.threadInheritParent !== undefined ||
      value.threadInitialHistoryLimit !== undefined ||
      value.replyToMode !== undefined ||
      value.workspaceWideEnabled !== undefined ||
      value.typingReaction !== undefined ||
      value.ackReaction !== undefined,
    { message: 'At least one routing setting must be provided' },
  )
  .superRefine((value, ctx) => {
    const normalizedPrefix =
      typeof value.prefix === 'string' && value.prefix.trim().length > 0
        ? value.prefix.trim()
        : null
    const willRespond =
      value.dedicated_channel === true ||
      value.respond_on_mention === true ||
      normalizedPrefix !== null
    if (
      value.dedicated_channel === false &&
      value.respond_on_mention === false &&
      normalizedPrefix === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at least one trigger: dedicated replies, @mentions, or a prefix.',
        path: ['dedicated_channel'],
      })
    }
    if (!willRespond && value.thread_support === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Thread support needs at least one message trigger enabled.',
        path: ['thread_support'],
      })
    }
  })

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const install = await getHostedSlackInstallForAssistant(supabase, id)
    if (!install || !install.botToken || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const conversations = await listSlackHostedConversations(install.botToken)
    const [bindings, usersResult, workspaceAgents, surfaceDefault] = await Promise.allSettled([
      listHostedSlackBindingsForAssistant(supabase, id),
      listSlackHostedUsers(install.botToken),
      listHostedSlackWorkspaceAgents(supabase, install.teamId),
      getChannelSurfaceDefaultBinding({
        channelType: 'slack',
        surfaceOwnerKind: 'team',
        surfaceOwnerId: install.teamId,
      }),
    ])
    const bindingsValue =
      bindings.status === 'fulfilled' ? bindings.value : []
    const users =
      usersResult.status === 'fulfilled' ? usersResult.value : []
    const workspaceAgentsValue =
      workspaceAgents.status === 'fulfilled' ? workspaceAgents.value : []
    const surfaceDefaultValue =
      surfaceDefault.status === 'fulfilled' ? surfaceDefault.value : null
    const userDirectoryAvailable = usersResult.status === 'fulfilled'
    const userDirectoryError =
      usersResult.status === 'rejected'
        ? usersResult.reason instanceof Error
          ? usersResult.reason.message
          : 'Failed to load Slack users'
        : null
    const activityByBindingId = Object.fromEntries(
      await Promise.all(
        bindingsValue.map(async (binding) => [
          binding.id,
          await getHostedSlackActivitySnapshot(supabase, binding.id),
        ] as const),
      ),
    )
    const settingsTarget = bindingsValue[0] ?? install
    const activity = settingsTarget ? activityByBindingId[settingsTarget.id] ?? null : null
    const surfaceDefaultAgent =
      surfaceDefaultValue
        ? workspaceAgentsValue.find((agent) => agent.assistantId === surfaceDefaultValue.assistantId) ?? null
        : null
    return NextResponse.json({
      workspace: {
        id: install.teamId,
        name: install.teamName,
      },
      installChannelId: install.id,
      connectedChannelId: settingsTarget?.externalChannelId ?? null,
      bindings: bindingsValue.map((binding) => ({
        channelId: binding.id,
        externalChannelId: binding.externalChannelId,
        conversationLabel:
          typeof binding.channelConfig?.slack_conversation_label === 'string'
            ? binding.channelConfig.slack_conversation_label
            : binding.externalChannelId,
        conversationType:
          binding.channelConfig?.slack_conversation_type === 'public' ||
          binding.channelConfig?.slack_conversation_type === 'private' ||
          binding.channelConfig?.slack_conversation_type === 'mpim' ||
          binding.channelConfig?.slack_conversation_type === 'im'
            ? binding.channelConfig.slack_conversation_type
            : null,
        routingConfig: normalizeHostedSlackRoutingConfig(binding.inboundRoutingConfig),
        allowedUsers: normalizeHostedSlackAllowedUserIds(binding.channelConfig),
        streamingPreview: normalizeHostedSlackStreamingPreview(binding.channelConfig),
        streamingMode: normalizeHostedSlackStreamingMode(binding.channelConfig),
        nativeStreaming: normalizeHostedSlackNativeStreaming(binding.channelConfig),
        threadHistoryScope: normalizeHostedSlackThreadHistoryScope(binding.channelConfig),
        threadInheritParent: normalizeHostedSlackThreadInheritParent(binding.channelConfig),
        threadInitialHistoryLimit: normalizeHostedSlackThreadInitialHistoryLimit(
          binding.channelConfig,
        ),
        replyToMode: normalizeHostedSlackReplyToMode(binding.channelConfig),
        workspaceWideEnabled: normalizeHostedSlackWorkspaceWideEnabled(binding.channelConfig),
        ackReaction:
          normalizeHostedSlackAckReaction(binding.channelConfig) ??
          DEFAULT_HOSTED_SLACK_ACK_REACTION,
        typingReaction:
          normalizeHostedSlackTypingReaction(binding.channelConfig) ??
          DEFAULT_HOSTED_SLACK_TYPING_REACTION,
        activity: activityByBindingId[binding.id] ?? null,
      })),
      routingConfig: normalizeHostedSlackRoutingConfig(settingsTarget.inboundRoutingConfig),
      allowedUsers: normalizeHostedSlackAllowedUserIds(settingsTarget.channelConfig),
      streamingPreview: normalizeHostedSlackStreamingPreview(settingsTarget.channelConfig),
      streamingMode: normalizeHostedSlackStreamingMode(settingsTarget.channelConfig),
      nativeStreaming: normalizeHostedSlackNativeStreaming(settingsTarget.channelConfig),
      threadHistoryScope: normalizeHostedSlackThreadHistoryScope(settingsTarget.channelConfig),
      threadInheritParent: normalizeHostedSlackThreadInheritParent(settingsTarget.channelConfig),
      threadInitialHistoryLimit: normalizeHostedSlackThreadInitialHistoryLimit(
        settingsTarget.channelConfig,
      ),
      replyToMode: normalizeHostedSlackReplyToMode(settingsTarget.channelConfig),
      workspaceWideEnabled: normalizeHostedSlackWorkspaceWideEnabled(install.channelConfig),
      ackReaction:
        normalizeHostedSlackAckReaction(settingsTarget.channelConfig) ??
        DEFAULT_HOSTED_SLACK_ACK_REACTION,
      typingReaction:
        normalizeHostedSlackTypingReaction(settingsTarget.channelConfig) ??
        DEFAULT_HOSTED_SLACK_TYPING_REACTION,
      activity,
      conversations,
      users,
      userDirectoryAvailable,
      userDirectoryError,
      workspaceAgents: workspaceAgentsValue.map((agent) => ({
        assistantId: agent.assistantId,
        assistantName: agent.assistantName,
        assistantDescription: agent.assistantDescription,
        installChannelId: agent.installChannelId,
        aliases: agent.aliases,
        boundConversationCount: agent.boundConversationCount,
        workspaceWideEnabled: agent.workspaceWideEnabled,
        isCurrentAssistant: agent.assistantId === id,
        isWorkspaceDefault: surfaceDefaultValue?.assistantId === agent.assistantId,
      })),
      surfaceDefault: surfaceDefaultAgent
        ? {
            assistantId: surfaceDefaultAgent.assistantId,
            assistantName: surfaceDefaultAgent.assistantName,
            installChannelId: surfaceDefaultAgent.installChannelId,
            aliases: surfaceDefaultAgent.aliases,
            isCurrentAssistant: surfaceDefaultAgent.assistantId === id,
          }
        : null,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-conversations', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-slack-conversations' },
    })
    return NextResponse.json(
      { error: 'Failed to load Slack conversations.' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = bindSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const install = await getHostedSlackInstallForAssistant(supabase, id)
    if (!install || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const binding = await bindHostedSlackAssistantToConversation({
      supabase,
      assistantId: id,
      teamId: install.teamId,
      slackChannelId: parsed.data.conversationId,
      conversationLabel: parsed.data.conversationLabel,
      conversationType: parsed.data.conversationType,
      boundVia: 'web_bind',
    })

    if (!binding) {
      return NextResponse.json(
        { error: 'Slack bind failed for this assistant.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      ok: true,
      binding: {
        channelId: binding.id,
        externalChannelId: binding.externalChannelId,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-conversations', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-slack-conversations' },
    })
    return NextResponse.json(
      { error: 'Failed to bind Slack conversation.' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const install = await getHostedSlackInstallForAssistant(supabase, id)
    if (!install || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const parsed = unbindSchema.safeParse(await request.json().catch(() => null))
    const targetChannelId = parsed.success ? parsed.data.assistantChannelId : undefined
    const binding = await unbindHostedSlackAssistantFromConversation({
      supabase,
      assistantChannelId: targetChannelId || install.id,
      teamId: install.teamId,
    })

    if (!binding) {
      return NextResponse.json(
        { error: 'Slack unbind failed for this assistant.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      ok: true,
      binding: {
        channelId: binding.id,
        externalChannelId: binding.externalChannelId,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-conversations', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-slack-conversations' },
    })
    return NextResponse.json(
      { error: 'Failed to unbind Slack conversation.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = routingConfigSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const install = await getHostedSlackInstallForAssistant(supabase, id)
    if (!install || !install.teamId) {
      return NextResponse.json(
        { error: 'Hosted Slack is not installed for this assistant yet.' },
        { status: 404 },
      )
    }

    const targetChannelId = parsed.data.assistantChannelId || install.id
    const requestedWorkspaceWideEnabled = parsed.data.workspaceWideEnabled
    if (requestedWorkspaceWideEnabled === true) {
      const currentSurfaceDefault = await getChannelSurfaceDefaultBinding({
        channelType: 'slack',
        surfaceOwnerKind: 'team',
        surfaceOwnerId: install.teamId,
      })
      if (currentSurfaceDefault && currentSurfaceDefault.assistantId !== id) {
        const workspaceAgents = await listHostedSlackWorkspaceAgents(supabase, install.teamId)
        const owner =
          workspaceAgents.find((agent) => agent.assistantId === currentSurfaceDefault.assistantId) ??
          null
        return NextResponse.json(
          {
            error: owner
              ? `${owner.assistantName} is already the Slack workspace default for ${install.teamName ?? install.teamId}. Disable it there before enabling this assistant everywhere.`
              : 'Another assistant is already the Slack workspace default for this workspace.',
            surfaceDefault: owner
              ? {
                  assistantId: owner.assistantId,
                  assistantName: owner.assistantName,
                  installChannelId: owner.installChannelId,
                }
              : null,
          },
          { status: 409 },
        )
      }
    }

    const binding = await updateHostedSlackRoutingConfig({
      supabase,
      assistantChannelId: targetChannelId,
      teamId: install.teamId,
      inboundRoutingConfig: {
        ...(parsed.data.dedicated_channel !== undefined
          ? { dedicated_channel: parsed.data.dedicated_channel }
          : {}),
        ...(parsed.data.prefix !== undefined ? { prefix: parsed.data.prefix } : {}),
        ...(parsed.data.respond_on_mention !== undefined
          ? { respond_on_mention: parsed.data.respond_on_mention }
          : {}),
        ...(parsed.data.thread_support !== undefined
          ? { thread_support: parsed.data.thread_support }
          : {}),
        ...(parsed.data.ignore_bots !== undefined
          ? { ignore_bots: parsed.data.ignore_bots }
          : {}),
      },
      typingReaction: parsed.data.typingReaction,
      ackReaction: parsed.data.ackReaction,
      streamingPreview: parsed.data.streamingPreview,
      streamingMode: parsed.data.streamingMode,
      nativeStreaming: parsed.data.nativeStreaming,
      allowedUserIds: parsed.data.allowedUsers,
      threadHistoryScope: parsed.data.threadHistoryScope,
      threadInheritParent: parsed.data.threadInheritParent,
      threadInitialHistoryLimit: parsed.data.threadInitialHistoryLimit,
      replyToMode: parsed.data.replyToMode,
      ...(parsed.data.workspaceWideEnabled !== undefined
        ? { workspaceWideEnabled: parsed.data.workspaceWideEnabled }
        : {}),
    })

    if (!binding) {
      return NextResponse.json(
        { error: 'Slack routing update failed for this assistant.' },
        { status: 409 },
      )
    }

    if (targetChannelId === install.id && requestedWorkspaceWideEnabled === true) {
      await setChannelSurfaceDefault({
        channelType: 'slack',
        surfaceOwnerKind: 'team',
        surfaceOwnerId: install.teamId,
        assistantId: id,
        assistantChannelId: install.id,
      })
    }

    if (targetChannelId === install.id && requestedWorkspaceWideEnabled === false) {
      const currentSurfaceDefault = await getChannelSurfaceDefaultBinding({
        channelType: 'slack',
        surfaceOwnerKind: 'team',
        surfaceOwnerId: install.teamId,
      })
      if (currentSurfaceDefault?.assistantId === id) {
        await clearChannelSurfaceDefault({
          channelType: 'slack',
          surfaceOwnerKind: 'team',
          surfaceOwnerId: install.teamId,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      routingConfig: normalizeHostedSlackRoutingConfig(binding.inboundRoutingConfig),
      allowedUsers: normalizeHostedSlackAllowedUserIds(binding.channelConfig),
      streamingPreview: normalizeHostedSlackStreamingPreview(binding.channelConfig),
      streamingMode: normalizeHostedSlackStreamingMode(binding.channelConfig),
      nativeStreaming: normalizeHostedSlackNativeStreaming(binding.channelConfig),
      threadHistoryScope: normalizeHostedSlackThreadHistoryScope(binding.channelConfig),
      threadInheritParent: normalizeHostedSlackThreadInheritParent(binding.channelConfig),
      threadInitialHistoryLimit: normalizeHostedSlackThreadInitialHistoryLimit(
        binding.channelConfig,
      ),
      replyToMode: normalizeHostedSlackReplyToMode(binding.channelConfig),
      workspaceWideEnabled: normalizeHostedSlackWorkspaceWideEnabled(binding.channelConfig),
      ackReaction:
        normalizeHostedSlackAckReaction(binding.channelConfig) ??
        DEFAULT_HOSTED_SLACK_ACK_REACTION,
      typingReaction:
        normalizeHostedSlackTypingReaction(binding.channelConfig) ??
        DEFAULT_HOSTED_SLACK_TYPING_REACTION,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/slack-conversations', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-slack-conversations' },
    })
    return NextResponse.json(
      { error: 'Failed to update Slack routing.' },
      { status: 500 },
    )
  }
}
