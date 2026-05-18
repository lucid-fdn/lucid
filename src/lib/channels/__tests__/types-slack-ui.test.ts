import { describe, expect, it } from 'vitest'
import {
  getChannelStatusForUi,
  getSlackAllowedUsersSummaryForUi,
  getSlackBindGuidanceForUi,
  getSlackConversationLabelForUi,
  getSlackDeliverySummaryForUi,
  getSlackRoutingSummaryForUi,
  getSlackStatusDescriptionForUi,
  getSlackWorkspaceNameForUi,
  isChannelConnectedForUi,
  isSlackInstalledUnbound,
} from '../types'

describe('Slack hosted UI channel state', () => {
  const installedUnboundSlackChannel = {
    channel_type: 'slack',
    is_active: false,
    channel_config: {
      install_status: 'installed_unbound',
      slack_team_id: 'T123',
    },
  }

  it('treats installed hosted Slack as pending bind', () => {
    expect(isSlackInstalledUnbound(installedUnboundSlackChannel)).toBe(true)
    expect(isChannelConnectedForUi(installedUnboundSlackChannel)).toBe(true)
    expect(getChannelStatusForUi(installedUnboundSlackChannel)).toBe('pending')
    expect(getSlackWorkspaceNameForUi(installedUnboundSlackChannel)).toBe('T123')
    expect(getSlackStatusDescriptionForUi(installedUnboundSlackChannel)).toBe(
      'Installed in Slack, waiting for a DM or channel bind',
    )
    expect(getSlackBindGuidanceForUi(installedUnboundSlackChannel)).toBe(
      'Finish from Lucid, Slack App Home, or run /lucid bind in the target conversation.',
    )
  })

  it('does not treat unrelated inactive channels as connected', () => {
    const inactiveDiscordChannel = {
      channel_type: 'discord',
      is_active: false,
      channel_config: {},
    }

    expect(isSlackInstalledUnbound(inactiveDiscordChannel)).toBe(false)
    expect(isChannelConnectedForUi(inactiveDiscordChannel)).toBe(false)
    expect(getChannelStatusForUi(inactiveDiscordChannel)).toBe('inactive')
  })

  it('keeps active channels as active', () => {
    const activeSlackChannel = {
      channel_type: 'slack',
      is_active: true,
      external_channel_id: 'C123',
      channel_config: {
        install_status: 'installed_unbound',
        slack_team_name: 'Raijin Labs',
        slack_conversation_label: '#support-escalations (private)',
      },
    }

    expect(isSlackInstalledUnbound(activeSlackChannel)).toBe(false)
    expect(isChannelConnectedForUi(activeSlackChannel)).toBe(true)
    expect(getChannelStatusForUi(activeSlackChannel)).toBe('active')
    expect(getSlackWorkspaceNameForUi(activeSlackChannel)).toBe('Raijin Labs')
    expect(getSlackConversationLabelForUi(activeSlackChannel)).toBe(
      '#support-escalations (private)',
    )
    expect(getSlackStatusDescriptionForUi(activeSlackChannel)).toBe(
      'Listening in the bound Slack conversation',
    )
    expect(
      getSlackRoutingSummaryForUi({
        ...activeSlackChannel,
        inbound_routing_config: {
          dedicated_channel: true,
          respond_on_mention: true,
          prefix: '!lucid',
          thread_support: true,
          ignore_bots: true,
        },
      }),
    ).toBe('Routing: every message, @mentions, prefix !lucid, threads, ignores bots')
    expect(
      getSlackDeliverySummaryForUi({
        ...activeSlackChannel,
        channel_config: {
          ...activeSlackChannel.channel_config,
          slack_streaming_preview: false,
          slack_typing_reaction: 'thinking_face',
          slack_reply_to_mode: 'first',
          slack_thread_history_scope: 'channel',
          slack_thread_inherit_parent: true,
          slack_thread_initial_history_limit: 12,
        },
      }),
    ).toBe(
      'Delivery UX: live preview off, mode partial, typing :thinking_face:, reply threading first reply only, thread context include channel context, inherit parent, last 12 messages',
    )
    expect(
      getSlackAllowedUsersSummaryForUi({
        ...activeSlackChannel,
        channel_config: {
          ...activeSlackChannel.channel_config,
          slack_allowed_user_ids: ['U123', 'U456'],
        },
      }),
    ).toBe('Allowed users: U123, U456')
    expect(getSlackBindGuidanceForUi(activeSlackChannel)).toBeNull()
  })
})
