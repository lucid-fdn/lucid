import type {
  SlackHostedActivitySnapshot,
  SlackHostedAssistantBinding,
} from './bindings.js'

interface SlackPlainText {
  type: 'plain_text'
  text: string
  emoji?: boolean
}

function plainText(text: string): SlackPlainText {
  return { type: 'plain_text', text, emoji: true }
}

function getConfiguredConversationLabel(binding: SlackHostedAssistantBinding): string | null {
  const config =
    binding.channelConfig && typeof binding.channelConfig === 'object'
      ? binding.channelConfig
      : {}
  const configuredLabel = config.slack_conversation_label
  return typeof configuredLabel === 'string' && configuredLabel.trim().length > 0
    ? configuredLabel.trim()
    : null
}

function channelLabel(channelId: string | null, binding?: SlackHostedAssistantBinding): string {
  const configuredLabel = binding ? getConfiguredConversationLabel(binding) : null
  if (configuredLabel) return configuredLabel
  if (!channelId) return 'Not bound'
  if (channelId.startsWith('D')) return 'DM'
  return `<#${channelId}>`
}

function truncate(text: string | null | undefined, max = 120): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function summaryLine(params: { installs: number; bindings: number }): string {
  const installLabel =
    params.installs === 1 ? '1 agent ready to bind' : `${params.installs} agents ready to bind`
  const bindingLabel =
    params.bindings === 1 ? '1 active conversation' : `${params.bindings} active conversations`
  return `${installLabel} • ${bindingLabel}`
}

function routingSummary(binding: SlackHostedAssistantBinding): string {
  const config =
    binding.inboundRoutingConfig && typeof binding.inboundRoutingConfig === 'object'
      ? binding.inboundRoutingConfig
      : {}
  const parts: string[] = []
  if (config.dedicated_channel !== false) {
    parts.push('Replies to every message here')
  }
  if (config.respond_on_mention !== false) {
    parts.push('Also answers on @mentions')
  }
  if (typeof config.prefix === 'string' && config.prefix.trim().length > 0) {
    parts.push(`Prefix: ${config.prefix.trim()}`)
  }
  if (config.thread_support === true) {
    parts.push('Thread-aware')
  }
  return parts.length > 0 ? parts.join(' • ') : 'No reply triggers configured'
}

function deliverySummary(binding: SlackHostedAssistantBinding): string {
  const config =
    binding.channelConfig && typeof binding.channelConfig === 'object'
      ? binding.channelConfig
      : {}
  const streamingPreview = config.slack_streaming_preview !== false
  const streamingMode =
    config.slack_streaming_mode === 'off' ||
    config.slack_streaming_mode === 'block' ||
    config.slack_streaming_mode === 'progress'
      ? config.slack_streaming_mode
      : 'partial'
  const nativeStreaming = config.slack_native_streaming === true
  const ackReaction =
    Object.prototype.hasOwnProperty.call(config, 'slack_ack_reaction') &&
    (!config.slack_ack_reaction || typeof config.slack_ack_reaction !== 'string')
      ? null
      : typeof config.slack_ack_reaction === 'string' && config.slack_ack_reaction.trim().length > 0
        ? config.slack_ack_reaction.trim()
        : 'eyes'
  const typingReaction =
    Object.prototype.hasOwnProperty.call(config, 'slack_typing_reaction') &&
    (!config.slack_typing_reaction || typeof config.slack_typing_reaction !== 'string')
      ? null
      : typeof config.slack_typing_reaction === 'string' && config.slack_typing_reaction.trim().length > 0
        ? config.slack_typing_reaction.trim()
        : 'hourglass_flowing_sand'
  const threadHistoryScope =
    config.slack_thread_history_scope === 'channel' ? 'include channel context' : 'thread only'
  const replyToMode =
    config.slack_reply_to_mode === 'first' || config.slack_reply_to_mode === 'all'
      ? config.slack_reply_to_mode
      : 'off'
  const inheritParent = config.slack_thread_inherit_parent === true ? 'yes' : 'no'
  const initialHistoryLimit =
    typeof config.slack_thread_initial_history_limit === 'number' &&
    Number.isInteger(config.slack_thread_initial_history_limit) &&
    config.slack_thread_initial_history_limit >= 0
      ? String(config.slack_thread_initial_history_limit)
      : 'default'
  const replyThreading =
    replyToMode === 'off'
      ? 'chat only'
      : replyToMode === 'first'
        ? 'first reply only'
        : 'all reply chunks'
  return `Ack: ${ackReaction ? `:${ackReaction}:` : 'off'} • Live preview: ${streamingPreview ? 'on' : 'off'} • Streaming mode: ${streamingMode}${nativeStreaming ? ' + native' : ''} • Typing feedback: ${typingReaction ? `:${typingReaction}:` : 'off'} • Reply threading: ${replyThreading} • Thread context: ${threadHistoryScope} • Inherit parent: ${inheritParent} • Initial history: ${initialHistoryLimit}`
}

function allowedUsersSummary(binding: SlackHostedAssistantBinding): string | null {
  const config =
    binding.channelConfig && typeof binding.channelConfig === 'object'
      ? binding.channelConfig
      : {}
  const users = Array.isArray(config.slack_allowed_user_ids)
    ? config.slack_allowed_user_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  if (users.length === 0) return null
  return `Allowed users: ${users.join(', ')}`
}

export function buildSlackAppHomeView(params: {
  installs: SlackHostedAssistantBinding[]
  bindings: SlackHostedAssistantBinding[]
  activityByBindingId?: Record<string, SlackHostedActivitySnapshot | undefined>
}) {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: plainText('Lucid for Slack'),
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          'Install once, then choose exactly where each Lucid agent should be active. Bind to a DM, pick a channel, or unbind cleanly from here.',
      },
      accessory: {
        type: 'button',
        action_id: 'lucid_refresh_home',
        text: plainText('Refresh'),
        value: 'refresh',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: summaryLine({
            installs: params.installs.length,
            bindings: params.bindings.length,
          }),
        },
      ],
    },
    { type: 'divider' },
  ]

  if (params.installs.length === 0 && params.bindings.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          'No Lucid agents are installed in this Slack workspace yet.\n\nStart from Lucid and click *Install on Slack* for an agent.',
      },
    })
  }

  if (params.installs.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Ready to bind*',
      },
    })

    for (const install of params.installs) {
      const description = truncate(install.assistantDescription, 90)
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${install.assistantName}*`,
            description || 'Installed in this workspace and waiting for a target conversation.',
          ].join('\n'),
        },
      })
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Bind directly to a DM or choose a Slack channel below.',
          },
        ],
      })
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'lucid_bind_dm',
            text: plainText('Bind DM'),
            style: 'primary',
            value: install.id,
          },
          {
            type: 'button',
            action_id: 'lucid_choose_channel',
            text: plainText('Choose channel'),
            value: install.id,
          },
        ],
      })
    }

    blocks.push({ type: 'divider' })
  }

  if (params.bindings.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Current bindings*',
      },
    })

    for (const binding of params.bindings) {
      const description = truncate(binding.assistantDescription, 90)
      const activity = params.activityByBindingId?.[binding.id]
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${binding.assistantName}*`,
            `Active in ${channelLabel(binding.externalChannelId, binding)}`,
            description || 'Currently active and ready to answer in this Slack conversation.',
          ].join('\n'),
        },
        accessory: {
          type: 'button',
          action_id: 'lucid_unbind',
          text: plainText('Unbind'),
          value: binding.id,
          style: 'danger',
        },
      })
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: [
              routingSummary(binding),
              deliverySummary(binding),
              allowedUsersSummary(binding),
              activity?.lastOutboundAt
                ? `Last outbound: ${activity.lastOutboundStatus || 'sent'}`
                : null,
              typeof activity?.lastReplyLatencyMs === 'number'
                ? `Last reply latency: ${Math.round(activity.lastReplyLatencyMs / 100) / 10}s`
                : null,
              activity?.lastOutboundError ? `Last error: ${activity.lastOutboundError}` : null,
              'Use `/lucid whoami` in that conversation to confirm the active agent, or `/lucid switch <agent>` to swap it.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        '*In-channel controls*',
        '`/lucid agents` to inspect what can speak here',
        '`/lucid switch <agent>` to swap the active agent in this conversation',
        '`/lucid whoami` to confirm who is active right now',
      ].join('\n'),
    },
  })

  return {
    type: 'home',
    blocks,
  }
}

export function buildSlackChooseChannelModal(params: {
  assistantChannelId: string
  assistantName: string
  userId: string
}) {
  return {
    type: 'modal',
    callback_id: 'lucid_bind_channel',
    private_metadata: JSON.stringify({
      assistantChannelId: params.assistantChannelId,
      userId: params.userId,
    }),
    title: plainText('Bind channel'),
    submit: plainText('Bind'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Choose where *${params.assistantName}* should be active in Slack.`,
        },
      },
      {
        type: 'input',
        block_id: 'channel_picker',
        label: plainText('Slack channel'),
        element: {
          type: 'conversations_select',
          action_id: 'selected_conversation',
          placeholder: plainText('Select a channel'),
          filter: {
            include: ['public', 'private', 'mpim'],
          },
          default_to_current_conversation: false,
        },
      },
    ],
  }
}

export function buildSlackChooseAgentForConversationModal(params: {
  channelId: string
  userId: string
  installs: SlackHostedAssistantBinding[]
}) {
  return {
    type: 'modal',
    callback_id: 'lucid_bind_current_conversation',
    private_metadata: JSON.stringify({
      channelId: params.channelId,
      userId: params.userId,
    }),
    title: plainText('Bind agent'),
    submit: plainText('Bind'),
    close: plainText('Cancel'),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Choose which agent should become active in ${channelLabel(params.channelId)}.`,
        },
      },
      {
        type: 'input',
        block_id: 'assistant_picker',
        label: plainText('Agent'),
        element: {
          type: 'static_select',
          action_id: 'assistant_channel_id',
          placeholder: plainText('Select an agent'),
          options: params.installs.map((install) => ({
            text: plainText(install.assistantName),
            value: install.id,
            description: truncate(install.assistantDescription, 75)
              ? plainText(truncate(install.assistantDescription, 75) as string)
              : undefined,
          })),
        },
      },
    ],
  }
}
