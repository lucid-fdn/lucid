import { describe, expect, it } from 'vitest'

import {
  buildSlackAppHomeView,
  buildSlackChooseAgentForConversationModal,
  buildSlackChooseChannelModal,
} from '../app-home.js'

const install = {
  id: 'ac_1',
  assistantId: 'a_1',
  assistantName: 'Sales Agent',
  assistantDescription: 'Handles pipeline triage.',
  externalChannelId: null,
  isActive: false,
  isPrimary: false,
  channelConfig: { hosted: true, install_status: 'installed_unbound' },
  inboundRoutingConfig: null,
  createdAt: null,
}

const binding = {
  ...install,
  id: 'ac_2',
  assistantId: 'a_2',
  assistantName: 'Support Agent',
  externalChannelId: 'C123',
  isActive: true,
  inboundRoutingConfig: {
    dedicated_channel: true,
    respond_on_mention: true,
    thread_support: true,
    ignore_bots: true,
    prefix: '!lucid',
  },
  channelConfig: {
    hosted: true,
    install_status: 'bound',
    slack_conversation_label: '#support-escalations (private)',
    slack_streaming_preview: false,
    slack_typing_reaction: 'thinking_face',
    slack_thread_history_scope: 'channel',
    slack_thread_inherit_parent: true,
    slack_thread_initial_history_limit: 12,
  },
}

describe('slack app home builders', () => {
  it('renders unbound installs and current bindings', () => {
    const view = buildSlackAppHomeView({
      installs: [install],
      bindings: [binding],
      activityByBindingId: {
        ac_2: {
          lastInboundAt: '2026-04-24T16:27:19Z',
          lastInboundStatus: 'done',
          lastOutboundAt: '2026-04-24T16:27:36Z',
          lastOutboundStatus: 'sent',
          lastOutboundError: null,
          lastReplyLatencyMs: 17000,
        },
      },
    })

    expect(view.type).toBe('home')
    expect(view.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'header' }),
        expect.objectContaining({
          type: 'context',
          elements: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining('1 agent ready to bind'),
            }),
          ]),
        }),
        expect.objectContaining({
          type: 'actions',
          elements: expect.arrayContaining([
            expect.objectContaining({ action_id: 'lucid_bind_dm', value: 'ac_1' }),
            expect.objectContaining({ action_id: 'lucid_choose_channel', value: 'ac_1' }),
          ]),
        }),
        expect.objectContaining({
          type: 'section',
          accessory: expect.objectContaining({ action_id: 'lucid_unbind', value: 'ac_2' }),
          text: expect.objectContaining({
            text: expect.stringContaining('Active in #support-escalations (private)'),
          }),
        }),
        expect.objectContaining({
          type: 'context',
          elements: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining('/lucid whoami'),
            }),
            expect.objectContaining({
              text: expect.stringContaining('Replies to every message here'),
            }),
            expect.objectContaining({
              text: expect.stringContaining('Last outbound: sent'),
            }),
            expect.objectContaining({
              text: expect.stringContaining('Last reply latency: 17s'),
            }),
            expect.objectContaining({
              text: expect.stringContaining('Live preview: off'),
            }),
            expect.objectContaining({
              text: expect.stringContaining('Initial history: 12'),
            }),
          ]),
        }),
        expect.objectContaining({
          type: 'section',
          text: expect.objectContaining({
            text: expect.stringContaining('/lucid switch <agent>'),
          }),
        }),
      ]),
    )
  })

  it('renders a channel picker modal', () => {
    const modal = buildSlackChooseChannelModal({
      assistantChannelId: 'ac_1',
      assistantName: 'Sales Agent',
      userId: 'U123',
    })

    expect(modal.callback_id).toBe('lucid_bind_channel')
    expect(modal.private_metadata).toContain('"assistantChannelId":"ac_1"')
    expect(modal.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'input',
          block_id: 'channel_picker',
        }),
      ]),
    )
  })

  it('renders an agent chooser modal for current conversation binding', () => {
    const modal = buildSlackChooseAgentForConversationModal({
      channelId: 'C999',
      userId: 'U123',
      installs: [install],
    })

    expect(modal.callback_id).toBe('lucid_bind_current_conversation')
    expect(modal.private_metadata).toContain('"channelId":"C999"')
    expect(modal.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'input',
          block_id: 'assistant_picker',
        }),
      ]),
    )
  })
})
