import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLaunchSlackAgentOpsFromControlPlane = vi.fn()
const mockLaunchSlackAgentOpsMessagesFromControlPlane = vi.fn()

vi.mock('../agent-ops-control-plane.js', () => ({
  launchSlackAgentOpsFromControlPlane: (...args: unknown[]) =>
    mockLaunchSlackAgentOpsFromControlPlane(...args),
  launchSlackAgentOpsMessagesFromControlPlane: (...args: unknown[]) =>
    mockLaunchSlackAgentOpsMessagesFromControlPlane(...args),
}))

import {
  buildSlackAgentOpsLaunchModal,
  buildSlackAgentOpsMenuBlocks,
  buildSlackLucidSlashAck,
  buildSlackInboundMessageData,
  isSlackUserMessageEvent,
  normalizeSlackInboundRoutingConfig,
  SlackGatewayManager,
  validateSlackAgentOpsModalTarget,
} from '../SlackGatewayManager.js'

beforeEach(() => {
  mockLaunchSlackAgentOpsFromControlPlane.mockReset()
  mockLaunchSlackAgentOpsMessagesFromControlPlane.mockReset()
})

describe('buildSlackLucidSlashAck', () => {
  it('immediately acknowledges Agent Ops slash commands before the control-plane launch finishes', () => {
    expect(buildSlackLucidSlashAck('ops qa https://preview.example.com')).toEqual({
      response_type: 'ephemeral',
      text: 'Starting Agent Ops...',
    })
    expect(buildSlackLucidSlashAck('agentops review https://preview.example.com')).toEqual({
      response_type: 'ephemeral',
      text: 'Starting Agent Ops...',
    })
    expect(buildSlackLucidSlashAck('check https://www.example.com')).toEqual({
      response_type: 'ephemeral',
      text: 'Starting Agent Ops...',
    })
    expect(buildSlackLucidSlashAck('buy weekly groceries under $120 from Carrefour')).toEqual({
      response_type: 'ephemeral',
      text: 'Starting Agent Ops...',
    })
  })

  it('does not add a noisy immediate acknowledgement for regular slash commands', () => {
    expect(buildSlackLucidSlashAck('check')).toBeNull()
    expect(buildSlackLucidSlashAck('whoami')).toBeNull()
    expect(buildSlackLucidSlashAck('sales rewrite this reply')).toBeNull()
  })
})

describe('Slack Agent Ops menu builders', () => {
  it('renders the empty /lucid Agent Ops picker blocks', () => {
    const blocks = buildSlackAgentOpsMenuBlocks()
    expect(blocks[0]).toEqual(expect.objectContaining({ type: 'header' }))
    expect(JSON.stringify(blocks)).toContain('Check page')
    expect(JSON.stringify(blocks)).toContain('Buy stuff')
    expect(JSON.stringify(blocks)).toContain('/lucid check https://www.lucid.foundation')
    expect(JSON.stringify(blocks)).toContain('/lucid buy weekly groceries under $120 from Carrefour')
  })

  it('renders workflow launch modals with channel/user metadata', () => {
    const modal = buildSlackAgentOpsLaunchModal({
      workflowToken: 'check',
      channelId: 'C123',
      userId: 'U123',
    })
    expect(modal.callback_id).toBe('lucid_agent_ops_launch_modal')
    expect(modal.private_metadata).toBe(JSON.stringify({
      workflowToken: 'check',
      channelId: 'C123',
      userId: 'U123',
    }))
    expect(JSON.stringify(modal.blocks)).toContain('Target URL')

    const buyModal = buildSlackAgentOpsLaunchModal({
      workflowToken: 'buy',
      channelId: 'C123',
      userId: 'U123',
    })
    expect(JSON.stringify(buyModal.blocks)).toContain('Purchase request')
  })

  it('validates modal targets by workflow shape', () => {
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'check',
      target: 'https://www.example.com',
    })).toBeNull()
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'check',
      target: 'www.example.com',
    })).toContain('full URL')
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'extract',
      target: 'pricing from https://www.example.com/pricing',
    })).toBeNull()
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'extract',
      target: 'pricing table',
    })).toContain('Include the source URL')
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'buy',
      target: 'weekly groceries under $120 from Carrefour',
    })).toBeNull()
    expect(validateSlackAgentOpsModalTarget({
      workflowToken: 'buy',
      target: 'milk',
    })).toContain('Describe what to buy')
  })
})

describe('normalizeSlackInboundRoutingConfig', () => {
  it('merges sane defaults into an empty routing config', () => {
    expect(normalizeSlackInboundRoutingConfig({})).toEqual({
      respond_on_mention: true,
      ignore_bots: true,
    })
  })

  it('preserves explicit routing flags while keeping defaults', () => {
    expect(
      normalizeSlackInboundRoutingConfig({
        dedicated_channel: true,
        respond_on_mention: false,
      }),
    ).toEqual({
      dedicated_channel: true,
      respond_on_mention: false,
      ignore_bots: true,
    })
  })
})

describe('buildSlackInboundMessageData', () => {
  it('stores raw payload inside message_data instead of top-level schema fields', () => {
    const messageData = buildSlackInboundMessageData({
      rawPayload: {
        channel: 'C123',
        text: 'hi',
      },
      attachments: [
        {
          kind: 'audio',
          file_id: 'F123',
        },
      ],
      threadTs: '171.0001',
      source: 'message',
    })

    expect(messageData).toEqual({
      channel_type: 'slack',
      thread_ts: '171.0001',
      source: 'message',
      attachments: [
        {
          kind: 'audio',
          file_id: 'F123',
        },
      ],
      slack_files: [
        {
          kind: 'audio',
          file_id: 'F123',
        },
      ],
      slack_raw_payload: {
        channel: 'C123',
        text: 'hi',
      },
    })
  })
})

describe('isSlackUserMessageEvent', () => {
  it('accepts plain messages even when subtype is explicitly undefined', () => {
    expect(
      isSlackUserMessageEvent({
        user: 'U123',
        channel: 'C123',
        ts: '171.0001',
        text: 'hi',
        subtype: undefined,
      }),
    ).toBe(true)
  })

  it('rejects real Slack subtypes', () => {
    expect(
      isSlackUserMessageEvent({
        user: 'U123',
        channel: 'C123',
        ts: '171.0001',
        text: 'hi',
        subtype: 'message_changed',
      }),
    ).toBe(false)
  })
})

describe('loadChannelsGroupedByToken', () => {
  function createSupabaseMock(rows: unknown[]) {
    const query = {
      eq: () => query,
      then: undefined,
    } as unknown as {
      eq: (field: string, value: unknown) => typeof query
    }

    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }
  }

  it('boots a hosted Slack client for installed-but-unbound rows', async () => {
    const supabase = createSupabaseMock([
      {
        id: 'ch-slack-unbound',
        assistant_id: 'assistant-1',
        channel_type: 'slack',
        external_channel_id: null,
        is_active: false,
        connection_mode: 'hosted',
        channel_config: {
          hosted: true,
          install_status: 'installed_unbound',
          slack_team_id: 'T123',
        },
        inbound_routing_config: {},
        encrypted_secrets: {
          encrypted_data: 'ciphertext',
        },
      },
    ])

    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    ;(manager as unknown as { decryptSecrets: (encrypted: string) => Record<string, string> }).decryptSecrets = () => ({
      bot_token: 'xoxb-hosted',
      app_token: 'xapp-hosted',
    })

    const grouped = await (manager as unknown as {
      loadChannelsGroupedByToken: () => Promise<Map<string, { appToken: string; channels: Map<string, unknown> }>>
    }).loadChannelsGroupedByToken()

    expect(grouped.size).toBe(1)
    expect(grouped.get('xoxb-hosted')?.appToken).toBe('xapp-hosted')
    expect(grouped.get('xoxb-hosted')?.channels.size).toBe(0)
  })

  it('still maps bound hosted Slack conversations for inbound handling', async () => {
    const supabase = createSupabaseMock([
      {
        id: 'ch-slack-bound',
        assistant_id: 'assistant-1',
        channel_type: 'slack',
        external_channel_id: 'C123',
        is_active: true,
        connection_mode: 'hosted',
        channel_config: {
          hosted: true,
          install_status: 'bound',
          slack_team_id: 'T123',
        },
        inbound_routing_config: {},
        encrypted_secrets: {
          encrypted_data: 'ciphertext',
        },
      },
    ])

    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    ;(manager as unknown as { decryptSecrets: (encrypted: string) => Record<string, string> }).decryptSecrets = () => ({
      bot_token: 'xoxb-hosted',
      app_token: 'xapp-hosted',
    })

    const grouped = await (manager as unknown as {
      loadChannelsGroupedByToken: () => Promise<Map<string, { appToken: string; channels: Map<string, { internalChannelId: string; typingReaction: string | null }> }>>
    }).loadChannelsGroupedByToken()

    expect(grouped.get('xoxb-hosted')?.channels.get('C123')?.internalChannelId).toBe('ch-slack-bound')
    expect(grouped.get('xoxb-hosted')?.channels.get('C123')?.typingReaction).toBe(
      'hourglass_flowing_sand',
    )
  })

  it('preserves existing Slack clients when a transient DB refresh fails', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: null, error: { message: 'upstream request timeout' } }),
          }),
        }),
      }),
    }
    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    const clients = (manager as unknown as {
      clients: Map<string, { botToken: string; channels: Map<string, unknown>; destroy: () => Promise<void> }>
    }).clients
    clients.set('token-hash', {
      botToken: 'xoxb-existing',
      channels: new Map([['C123', {}]]),
      destroy,
    })

    await manager.refresh()

    expect(clients.has('token-hash')).toBe(true)
    expect(destroy).not.toHaveBeenCalled()
  })
})

describe('inbound queueing', () => {
  it('treats thread follow-ups as valid triggers when thread support is enabled', async () => {
    const insertedEvent = {
      id: 'inbound-slack-thread-1',
      assistant_id: 'assistant-1',
      external_message_id: '171.0100',
    }

    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: insertedEvent, error: null }),
      }),
    })

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: insertSpy,
        }
      },
    }

    const addAckReaction = vi.fn().mockResolvedValue(undefined)
    const addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    const onInboundQueued = vi.fn().mockResolvedValue(undefined)
    const manager = new SlackGatewayManager(supabase as never, 'test-key', onInboundQueued)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addAckReaction = addAckReaction
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addProcessingReaction = addProcessingReaction

    await (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: 'still here',
        channel: 'C123',
        ts: '171.0100',
        thread_ts: '171.0001',
      },
      {
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: {
                dedicated_channel: false,
                respond_on_mention: false,
                thread_support: true,
              },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'channel',
              threadInheritParent: true,
              threadInitialHistoryLimit: 12,
            },
          ],
        ]),
      },
    )

    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        external_chat_id: 'C123:thread:171.0001',
        message_data: expect.objectContaining({
          thread_ts: '171.0001',
          slack_parent_chat_id: 'C123',
          slack_thread_history_scope: 'channel',
          slack_thread_inherit_parent: true,
          slack_thread_initial_history_limit: 12,
        }),
      }),
    )
    expect(addAckReaction).toHaveBeenCalledTimes(1)
    expect(addProcessingReaction).toHaveBeenCalledTimes(1)
    expect(onInboundQueued).toHaveBeenCalledTimes(1)
  })

  it('notifies the immediate enqueue hook after queueing a Slack message', async () => {
    const insertedEvent = {
      id: 'inbound-slack-1',
      assistant_id: 'assistant-1',
      external_message_id: '171.0001',
    }

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: insertedEvent, error: null }),
            }),
          }),
        }
      },
    }

    const onInboundQueued = vi.fn()
    const manager = new SlackGatewayManager(supabase as never, 'test-key', onInboundQueued)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addAckReaction = vi.fn().mockResolvedValue(undefined)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addProcessingReaction = vi.fn().mockResolvedValue(undefined)

    await (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: '<@B123> hi',
        channel: 'C123',
        ts: '171.0001',
        _isMention: true,
      },
      {
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
            },
          ],
        ]),
      },
    )

    expect(onInboundQueued).toHaveBeenCalledTimes(1)
    expect(onInboundQueued).toHaveBeenCalledWith(insertedEvent)
  })

  it('still adds the ack reaction when the immediate enqueue hook fails', async () => {
    const insertedEvent = {
      id: 'inbound-slack-2',
      assistant_id: 'assistant-1',
      external_message_id: '171.0002',
    }

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: insertedEvent, error: null }),
            }),
          }),
        }
      },
    }

    const onInboundQueued = vi.fn().mockRejectedValue(new Error('pulse unavailable'))
    const addAckReaction = vi.fn().mockResolvedValue(undefined)
    const addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    const manager = new SlackGatewayManager(supabase as never, 'test-key', onInboundQueued)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addAckReaction = addAckReaction
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addProcessingReaction = addProcessingReaction

    await expect(
      (manager as unknown as {
        handleMessage: (msg: unknown, client: unknown) => Promise<void>
      }).handleMessage(
        {
          user: 'U123',
          text: '<@B123> hi',
          channel: 'C123',
          ts: '171.0002',
          _isMention: true,
        },
        {
          botUserId: 'B123',
          channels: new Map([
            [
              'C123',
              {
                internalChannelId: 'channel-1',
                assistantId: 'assistant-1',
                externalChannelId: 'C123',
                routingConfig: { respond_on_mention: true },
                typingReaction: 'hourglass_flowing_sand',
              },
            ],
          ]),
        },
      ),
    ).resolves.toBeUndefined()

    expect(addAckReaction).toHaveBeenCalledTimes(1)
    expect(addProcessingReaction).toHaveBeenCalledTimes(1)
    expect(onInboundQueued).toHaveBeenCalledTimes(1)
  })

  it('does not make immediate enqueue wait for the ack reaction', async () => {
    const insertedEvent = {
      id: 'inbound-slack-3',
      assistant_id: 'assistant-1',
      external_message_id: '171.0003',
    }

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: insertedEvent, error: null }),
            }),
          }),
        }
      },
    }

    let releaseAck: (() => void) | null = null
    const ackGate = new Promise<void>((resolve) => {
      releaseAck = resolve
    })
    const addAckReaction = vi.fn().mockImplementation(() => ackGate)
    const addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    const onInboundQueued = vi.fn().mockResolvedValue(undefined)
    const manager = new SlackGatewayManager(supabase as never, 'test-key', onInboundQueued)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addAckReaction = addAckReaction
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addProcessingReaction = addProcessingReaction

    const handlePromise = (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: '<@B123> hi',
        channel: 'C123',
        ts: '171.0003',
        _isMention: true,
      },
      {
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
            },
          ],
        ]),
      },
    )

    await Promise.resolve()
    expect(addAckReaction).toHaveBeenCalledTimes(1)
    expect(addProcessingReaction).toHaveBeenCalledTimes(1)
    expect(onInboundQueued).toHaveBeenCalledTimes(1)

    releaseAck?.()
    await expect(handlePromise).resolves.toBeUndefined()
  })

  it('adds the processing reaction alongside the visible ack reaction', async () => {
    const insertedEvent = {
      id: 'inbound-slack-4',
      assistant_id: 'assistant-1',
      external_message_id: '171.0004',
    }

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: insertedEvent, error: null }),
            }),
          }),
        }
      },
    }

    const addAckReaction = vi.fn().mockResolvedValue(undefined)
    const addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addAckReaction = addAckReaction
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
    }).addProcessingReaction = addProcessingReaction

    await (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: '<@B123> hi',
        channel: 'C123',
        ts: '171.0004',
        _isMention: true,
      },
      {
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
            },
          ],
        ]),
      },
    )

    expect(addAckReaction).toHaveBeenCalledTimes(1)
    expect(addProcessingReaction).toHaveBeenCalledTimes(1)
  })

  it('routes explicit Slack mention targets to another available agent', async () => {
    const insertedEvent = {
      id: 'inbound-slack-explicit-1',
      assistant_id: 'assistant-sales',
      external_message_id: '171.0005',
    }

    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: insertedEvent, error: null }),
      }),
    })

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: insertSpy,
        }
      },
    }

    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
      listAvailableAgentsForWorkspace: () => Promise<{
        bindings: Array<{ id: string; assistantId: string; assistantName: string; aliases?: string[] }>
        conversationDefault: { id: string; assistantId: string; assistantName: string; aliases?: string[] } | null
      }>
    }).addAckReaction = vi.fn().mockResolvedValue(undefined)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
      listAvailableAgentsForWorkspace: () => Promise<{
        bindings: Array<{ id: string; assistantId: string; assistantName: string; aliases?: string[] }>
        conversationDefault: { id: string; assistantId: string; assistantName: string; aliases?: string[] } | null
      }>
    }).addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    ;(manager as unknown as {
      listAvailableAgentsForWorkspace: () => Promise<{
        bindings: Array<{ id: string; assistantId: string; assistantName: string; aliases?: string[] }>
        conversationDefault: { id: string; assistantId: string; assistantName: string; aliases?: string[] } | null
      }>
    }).listAvailableAgentsForWorkspace = vi.fn().mockResolvedValue({
      bindings: [
        { id: 'channel-1', assistantId: 'assistant-1', assistantName: 'General', aliases: ['general'] },
        { id: 'channel-sales', assistantId: 'assistant-sales', assistantName: 'Sales', aliases: ['sales'] },
      ],
      conversationDefault: {
        id: 'channel-1',
        assistantId: 'assistant-1',
        assistantName: 'General',
        aliases: ['general'],
      },
    })

    await (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: '<@B123> sales help me with pricing',
        channel: 'C123',
        ts: '171.0005',
        _isMention: true,
      },
      {
        teamId: 'T123',
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'thread',
              threadInheritParent: false,
              threadInitialHistoryLimit: null,
            },
          ],
        ]),
      },
    )

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-sales',
        assistant_id: 'assistant-sales',
        message_text: 'help me with pricing',
        external_chat_id: 'C123',
      }),
    )
  })

  it('does not run explicit agent targeting for ordinary dedicated-channel text', async () => {
    const insertedEvent = {
      id: 'inbound-slack-plain-1',
      assistant_id: 'assistant-1',
      external_message_id: '171.0006',
    }

    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: insertedEvent, error: null }),
      }),
    })

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: insertSpy,
        }
      },
    }

    const manager = new SlackGatewayManager(supabase as never, 'test-key')
    const listAvailableAgentsForWorkspace = vi.fn()
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
      listAvailableAgentsForWorkspace: () => Promise<unknown>
    }).addAckReaction = vi.fn().mockResolvedValue(undefined)
    ;(manager as unknown as {
      addAckReaction: () => Promise<void>
      addProcessingReaction: () => Promise<void>
      listAvailableAgentsForWorkspace: () => Promise<unknown>
    }).addProcessingReaction = vi.fn().mockResolvedValue(undefined)
    ;(manager as unknown as {
      listAvailableAgentsForWorkspace: () => Promise<unknown>
    }).listAvailableAgentsForWorkspace = listAvailableAgentsForWorkspace

    await (manager as unknown as {
      handleMessage: (msg: unknown, client: unknown) => Promise<void>
    }).handleMessage(
      {
        user: 'U123',
        text: 'sales are down',
        channel: 'C123',
        ts: '171.0006',
      },
      {
        teamId: 'T123',
        botUserId: 'B123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { dedicated_channel: true },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'thread',
              threadInheritParent: false,
              threadInitialHistoryLimit: null,
            },
          ],
        ]),
      },
    )

    expect(listAvailableAgentsForWorkspace).not.toHaveBeenCalled()
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        message_text: 'sales are down',
      }),
    )
  })

  it('queues /lucid <agent> ... prompts through the explicit target resolver', async () => {
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const queueSlackPromptToBinding = vi.fn().mockResolvedValue(true)
    ;(manager as unknown as {
      listAvailableAgentsForWorkspace: () => Promise<{
        bindings: Array<{ id: string; assistantId: string; assistantName: string; aliases?: string[] }>
        conversationDefault: { id: string; assistantId: string; assistantName: string; aliases?: string[] } | null
      }>
      queueSlackPromptToBinding: (...args: unknown[]) => Promise<boolean>
    }).listAvailableAgentsForWorkspace = vi.fn().mockResolvedValue({
      bindings: [
        { id: 'channel-1', assistantId: 'assistant-1', assistantName: 'General', aliases: ['general'] },
        { id: 'channel-sales', assistantId: 'assistant-sales', assistantName: 'Sales', aliases: ['sales'] },
      ],
      conversationDefault: {
        id: 'channel-1',
        assistantId: 'assistant-1',
        assistantName: 'General',
        aliases: ['general'],
      },
    })
    ;(manager as unknown as {
      listAvailableAgentsForWorkspace: () => Promise<{
        bindings: Array<{ id: string; assistantId: string; assistantName: string; aliases?: string[] }>
        conversationDefault: { id: string; assistantId: string; assistantName: string; aliases?: string[] } | null
      }>
      queueSlackPromptToBinding: (...args: unknown[]) => Promise<boolean>
    }).queueSlackPromptToBinding = queueSlackPromptToBinding

    const handled = await (manager as unknown as {
      handleLucidSlashCommand: (
        command: { text?: string; channelId: string; userId: string; triggerId?: string },
        client: unknown,
        respond: unknown,
      ) => Promise<boolean>
    }).handleLucidSlashCommand(
      {
        text: 'sales rewrite this reply',
        channelId: 'C123',
        userId: 'U123',
        triggerId: 'trigger-1',
      },
      {
        teamId: 'T123',
        channels: new Map(),
      },
      vi.fn(),
    )

    expect(handled).toBe(true)
    expect(queueSlackPromptToBinding).toHaveBeenCalledWith(
      'rewrite this reply',
      expect.objectContaining({
        channel: 'C123',
        user: 'U123',
        externalMessageId: 'trigger-1',
      }),
      expect.objectContaining({
        id: 'channel-sales',
        assistantId: 'assistant-sales',
      }),
    )
  })

  it('launches /lucid ops through the signed control-plane bridge', async () => {
    mockLaunchSlackAgentOpsMessagesFromControlPlane.mockResolvedValue(['Slack Agent Ops run started'])
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const respond = vi.fn().mockResolvedValue(undefined)

    const handled = await (manager as unknown as {
      handleLucidSlashCommand: (
        command: { text?: string; channelId: string; userId: string; triggerId?: string },
        client: unknown,
        respond: unknown,
      ) => Promise<boolean>
    }).handleLucidSlashCommand(
      {
        text: 'ops qa https://preview.example.com',
        channelId: 'C123',
        userId: 'U123',
        triggerId: 'trigger-ops',
      },
      {
        teamId: 'T123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              orgId: 'org-1',
              externalChannelId: 'C123',
              workspaceWideEnabled: false,
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'thread',
              threadInheritParent: false,
              threadInitialHistoryLimit: null,
            },
          ],
        ]),
      },
      respond,
    )

    expect(handled).toBe(true)
    expect(mockLaunchSlackAgentOpsMessagesFromControlPlane).toHaveBeenCalledWith({
      surfaceId: 'C123',
      externalUserId: 'U123',
      rawCommandArg: 'qa https://preview.example.com',
      binding: {
        assistant_id: 'assistant-1',
        org_id: 'org-1',
      },
    })
    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledWith({
        response_type: 'ephemeral',
        text: 'Slack Agent Ops run started',
      })
    })
  })

  it('shows the Agent Ops picker when /lucid has no arguments', async () => {
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const respond = vi.fn().mockResolvedValue(undefined)

    const handled = await (manager as unknown as {
      handleLucidSlashCommand: (
        command: { text?: string; channelId: string; userId: string; triggerId?: string },
        client: unknown,
        respond: unknown,
      ) => Promise<boolean>
    }).handleLucidSlashCommand(
      {
        text: '',
        channelId: 'C123',
        userId: 'U123',
      },
      {
        teamId: 'T123',
        channels: new Map(),
      },
      respond,
    )

    expect(handled).toBe(true)
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({
      response_type: 'ephemeral',
      text: expect.stringContaining('Launch Agent Ops'),
      blocks: expect.any(Array),
    }))
    expect(JSON.stringify(respond.mock.calls[0][0].blocks)).toContain('Check page')
  })

  it('launches modal-submitted Slack Agent Ops workflows through the same bridge', async () => {
    mockLaunchSlackAgentOpsMessagesFromControlPlane.mockResolvedValue([
      'Slack Agent Ops run started',
      'Second report chunk',
    ])
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const postEphemeral = vi.fn().mockResolvedValue(undefined)

    await (manager as unknown as {
      launchAgentOpsFromSlackMenu: (
        input: {
          channelId: string
          userId: string
          workflowToken: string
          target: string
          notes?: string
        },
        client: unknown,
      ) => Promise<void>
    }).launchAgentOpsFromSlackMenu(
      {
        channelId: 'C123',
        userId: 'U123',
        workflowToken: 'check',
        target: 'https://www.example.com',
        notes: 'before launch',
      },
      {
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              orgId: 'org-1',
              externalChannelId: 'C123',
              workspaceWideEnabled: false,
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'thread',
              threadInheritParent: false,
              threadInitialHistoryLimit: null,
            },
          ],
        ]),
        postEphemeral,
      },
    )

    expect(mockLaunchSlackAgentOpsMessagesFromControlPlane).toHaveBeenCalledWith({
      surfaceId: 'C123',
      externalUserId: 'U123',
      rawCommandArg: 'check https://www.example.com - before launch',
      binding: {
        assistant_id: 'assistant-1',
        org_id: 'org-1',
      },
    })
    expect(postEphemeral).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Starting Agent Ops...',
    }))
    expect(postEphemeral).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Slack Agent Ops run started',
    }))
    expect(postEphemeral).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Second report chunk',
    }))
  })

  it('launches direct Browser Operator slash aliases through the same bridge', async () => {
    mockLaunchSlackAgentOpsMessagesFromControlPlane.mockResolvedValue(['Slack Agent Ops run started'])
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const respond = vi.fn().mockResolvedValue(undefined)

    const handled = await (manager as unknown as {
      handleLucidSlashCommand: (
        command: { text?: string; channelId: string; userId: string; triggerId?: string },
        client: unknown,
        respond: unknown,
      ) => Promise<boolean>
    }).handleLucidSlashCommand(
      {
        text: 'check https://www.example.com',
        channelId: 'C123',
        userId: 'U123',
      },
      {
        teamId: 'T123',
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              orgId: 'org-1',
              externalChannelId: 'C123',
              workspaceWideEnabled: false,
              routingConfig: { respond_on_mention: true },
              typingReaction: 'hourglass_flowing_sand',
              allowedUserIds: [],
              threadHistoryScope: 'thread',
              threadInheritParent: false,
              threadInitialHistoryLimit: null,
            },
          ],
        ]),
      },
      respond,
    )

    expect(handled).toBe(true)
    expect(mockLaunchSlackAgentOpsMessagesFromControlPlane).toHaveBeenCalledWith(expect.objectContaining({
      rawCommandArg: 'check https://www.example.com',
    }))
  })

  it('returns immediately for Slack Agent Ops slash commands while the launch continues', async () => {
    mockLaunchSlackAgentOpsMessagesFromControlPlane.mockImplementation(
      () => new Promise<string[]>(() => {}),
    )
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const respond = vi.fn().mockResolvedValue(undefined)

    const handled = await Promise.race([
      (manager as unknown as {
        handleLucidSlashCommand: (
          command: { text?: string; channelId: string; userId: string; triggerId?: string },
          client: unknown,
          respond: unknown,
        ) => Promise<boolean>
      }).handleLucidSlashCommand(
        {
          text: 'check https://www.example.com',
          channelId: 'C123',
          userId: 'U123',
        },
        {
          teamId: 'T123',
          channels: new Map([
            [
              'C123',
              {
                internalChannelId: 'channel-1',
                assistantId: 'assistant-1',
                orgId: 'org-1',
                externalChannelId: 'C123',
                workspaceWideEnabled: false,
                routingConfig: { respond_on_mention: true },
                typingReaction: 'hourglass_flowing_sand',
                allowedUserIds: [],
                threadHistoryScope: 'thread',
                threadInheritParent: false,
                threadInitialHistoryLimit: null,
              },
            ],
          ]),
        },
        respond,
      ),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 50)),
    ])

    expect(handled).toBe(true)
    expect(mockLaunchSlackAgentOpsMessagesFromControlPlane).toHaveBeenCalledWith(expect.objectContaining({
      rawCommandArg: 'check https://www.example.com',
    }))
    expect(respond).not.toHaveBeenCalled()
  })

  it('does not launch /lucid ops until the Slack conversation has an active binding', async () => {
    const manager = new SlackGatewayManager({} as never, 'test-key')
    const respond = vi.fn().mockResolvedValue(undefined)

    const handled = await (manager as unknown as {
      handleLucidSlashCommand: (
        command: { text?: string; channelId: string; userId: string; triggerId?: string },
        client: unknown,
        respond: unknown,
      ) => Promise<boolean>
    }).handleLucidSlashCommand(
      {
        text: 'ops qa https://preview.example.com',
        channelId: 'C123',
        userId: 'U123',
      },
      {
        teamId: 'T123',
        channels: new Map(),
      },
      respond,
    )

    expect(handled).toBe(true)
    expect(mockLaunchSlackAgentOpsMessagesFromControlPlane).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({
      response_type: 'ephemeral',
      text: expect.stringContaining('not bound'),
    })
  })

  it('queues Slack system events for bound conversations without ack reactions', async () => {
    const insertedEvent = {
      id: 'inbound-slack-system-1',
      assistant_id: 'assistant-1',
      external_message_id: 'reaction_added:171.1000',
    }

    const supabase = {
      from: (table: string) => {
        if (table !== 'assistant_inbound_events') {
          throw new Error(`Unexpected table ${table}`)
        }
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                expect(payload.message_text).toBe('Slack reaction added: :eyes:.')
                expect(payload.message_data).toEqual(
                  expect.objectContaining({
                    source: 'system_event',
                    slack_system_event: true,
                    slack_event_type: 'reaction_added',
                  }),
                )
                return { data: insertedEvent, error: null }
              },
            }),
          }),
        }
      },
    }

    const onInboundQueued = vi.fn()
    const manager = new SlackGatewayManager(supabase as never, 'test-key', onInboundQueued)

    await (manager as unknown as {
      handleSystemEvent: (event: unknown, client: unknown) => Promise<void>
    }).handleSystemEvent(
      {
        channelId: 'C123',
        actorUserId: 'U123',
        eventType: 'reaction_added',
        text: 'Slack reaction added: :eyes:.',
        rawPayload: { reaction: 'eyes', item: { channel: 'C123', ts: '171.0001' } },
        externalMessageId: 'reaction_added:171.1000',
      },
      {
        channels: new Map([
          [
            'C123',
            {
              internalChannelId: 'channel-1',
              assistantId: 'assistant-1',
              externalChannelId: 'C123',
              routingConfig: { dedicated_channel: true },
              typingReaction: 'hourglass_flowing_sand',
            },
          ],
        ]),
      },
    )

    expect(onInboundQueued).toHaveBeenCalledWith(insertedEvent)
  })
})
