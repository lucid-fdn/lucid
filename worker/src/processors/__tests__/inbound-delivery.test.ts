import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deliverFinalResponse,
  getDiscordThreadContextConfig,
  getInboundStoredMessageRole,
  getSlackThreadContextConfig,
  ensureInboundReplyMaterialized,
  isNonReplyingSystemEvent,
  loadDiscordParentContextMessages,
  loadSlackParentContextMessages,
  repairCompletedInboundDelivery,
  shouldSkipDuplicateInbound,
} from '../inbound.js'

const mockEnqueueOutboundEventImmediately = vi.fn()
const mockMarkOutboundSent = vi.fn().mockResolvedValue(undefined)
const mockMarkOutboundFailed = vi.fn().mockResolvedValue(undefined)

vi.mock('../../pulse/enqueue/outbound.js', () => ({
  enqueueOutboundEventImmediately: (...args: unknown[]) => mockEnqueueOutboundEventImmediately(...args),
}))

vi.mock('../../adapters/supabase.js', () => ({
  markOutboundSent: (...args: unknown[]) => mockMarkOutboundSent(...args),
  markOutboundFailed: (...args: unknown[]) => mockMarkOutboundFailed(...args),
  renewLease: vi.fn(),
}))

describe('deliverFinalResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists a sent outbound marker after streamed Telegram delivery', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined)

    const maybeSingleVerify = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const limit = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVerify })
    const order = vi.fn().mockReturnValue({ limit })
    const eqInbound = vi.fn().mockReturnValue({ order })
    const eqChannel = vi.fn().mockReturnValue({ eq: eqInbound })
    const selectVerify = vi.fn().mockReturnValue({ eq: eqChannel })

    const maybeSingleInsert = vi.fn().mockResolvedValue({
      data: { id: 'outbound-streamed-telegram', channel_id: 'channel-1', status: 'pending' },
      error: null,
    })
    const selectInsert = vi.fn().mockReturnValue({ maybeSingle: maybeSingleInsert })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })

    const from = vi.fn((table: string) => {
      if (table !== 'assistant_outbound_events') return {}
      return {
        insert,
        select: selectVerify,
      }
    })
    const supabase = { from } as any

    await deliverFinalResponse({
      supabase,
      config: {} as any,
      assistantOrgId: 'org-1',
      channelId: 'channel-1',
      channelType: 'telegram',
      inboundEventId: 'inbound-1',
      conversationId: 'conversation-1',
      messageText: 'hello from output',
      replyToExternalId: 'ext-1',
      output: { finalize },
    })

    expect(finalize).toHaveBeenCalledWith('hello from output')
    expect(insert).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      inbound_event_id: 'inbound-1',
      conversation_id: 'conversation-1',
      message_text: 'hello from output',
      reply_to_external_id: 'ext-1',
    })
    expect(mockEnqueueOutboundEventImmediately).not.toHaveBeenCalled()
    expect(mockMarkOutboundSent).toHaveBeenCalledWith(
      supabase,
      'outbound-streamed-telegram',
      null,
    )
  })

  it('persists a sent outbound marker after streamed Discord delivery', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined)

    const maybeSingleVerify = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const limit = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVerify })
    const order = vi.fn().mockReturnValue({ limit })
    const eqInbound = vi.fn().mockReturnValue({ order })
    const eqChannel = vi.fn().mockReturnValue({ eq: eqInbound })
    const selectVerify = vi.fn().mockReturnValue({ eq: eqChannel })

    const maybeSingleInsert = vi.fn().mockResolvedValue({
      data: { id: 'outbound-streamed', channel_id: 'channel-1', status: 'pending' },
      error: null,
    })
    const selectInsert = vi.fn().mockReturnValue({ maybeSingle: maybeSingleInsert })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })

    const from = vi.fn((table: string) => {
      if (table !== 'assistant_outbound_events') return {}
      return {
        insert,
        select: selectVerify,
      }
    })
    const supabase = { from } as any

    await deliverFinalResponse({
      supabase,
      config: {} as any,
      assistantOrgId: 'org-1',
      channelId: 'channel-1',
      channelType: 'discord',
      inboundEventId: 'inbound-1',
      conversationId: 'conversation-1',
      messageText: 'hello from output',
      replyToExternalId: 'ext-1',
      output: { finalize },
    })

    expect(finalize).toHaveBeenCalledWith('hello from output')
    expect(insert).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      inbound_event_id: 'inbound-1',
      conversation_id: 'conversation-1',
      message_text: 'hello from output',
      reply_to_external_id: 'ext-1',
    })
    expect(mockMarkOutboundSent).toHaveBeenCalledWith(
      supabase,
      'outbound-streamed',
      null,
    )
    expect(mockEnqueueOutboundEventImmediately).not.toHaveBeenCalled()
  })

  it('creates and enqueues an outbound event when no channel output is provided', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'outbound-1', channel_id: 'channel-1' },
      error: null,
    })
    const select = vi.fn().mockReturnValue({ maybeSingle })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as any

    await deliverFinalResponse({
      supabase,
      config: {} as any,
      assistantOrgId: 'org-1',
      channelId: 'channel-1',
      channelType: 'discord',
      inboundEventId: 'inbound-1',
      conversationId: 'conversation-1',
      messageText: 'hello from queue',
      replyToExternalId: 'ext-1',
    })

    expect(from).toHaveBeenCalledWith('assistant_outbound_events')
    expect(insert).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      inbound_event_id: 'inbound-1',
      conversation_id: 'conversation-1',
      message_text: 'hello from queue',
      reply_to_external_id: 'ext-1',
    })
    expect(mockEnqueueOutboundEventImmediately).toHaveBeenCalledWith({
      id: 'outbound-1',
      channel_id: 'channel-1',
      org_id: 'org-1',
    })
  })

  it('recovers an outbound row by verifying persistence when insert returns no row', async () => {
    const maybeSingleInsert = vi.fn().mockResolvedValueOnce({
      data: null,
      error: null,
    })
    const selectInsert = vi.fn().mockReturnValue({ maybeSingle: maybeSingleInsert })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })

    const maybeSingleVerify = vi.fn().mockResolvedValueOnce({
      data: { id: 'outbound-recovered', channel_id: 'channel-1' },
      error: null,
    })
    const limit = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVerify })
    const order = vi.fn().mockReturnValue({ limit })
    const eqInbound = vi.fn().mockReturnValue({ order })
    const eqChannel = vi.fn().mockReturnValue({ eq: eqInbound })
    const selectVerify = vi.fn().mockReturnValue({ eq: eqChannel })

    const from = vi.fn((table: string) => {
      if (table !== 'assistant_outbound_events') return {}
      return {
        insert,
        select: selectVerify,
      }
    })

    const supabase = { from } as any

    await deliverFinalResponse({
      supabase,
      config: {} as any,
      assistantOrgId: 'org-1',
      channelId: 'channel-1',
      channelType: 'discord',
      inboundEventId: 'inbound-1',
      conversationId: 'conversation-1',
      messageText: 'hello from recovery',
      replyToExternalId: 'ext-1',
    })

    expect(mockEnqueueOutboundEventImmediately).toHaveBeenCalledWith({
      id: 'outbound-recovered',
      channel_id: 'channel-1',
      org_id: 'org-1',
    })
  })

  it('throws when outbound persistence cannot be proven', async () => {
    const maybeSingleInsert = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const selectInsert = vi.fn().mockReturnValue({ maybeSingle: maybeSingleInsert })
    const insert = vi.fn().mockReturnValue({ select: selectInsert })

    const maybeSingleVerify = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const limit = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVerify })
    const order = vi.fn().mockReturnValue({ limit })
    const eqInbound = vi.fn().mockReturnValue({ order })
    const eqChannel = vi.fn().mockReturnValue({ eq: eqInbound })
    const selectVerify = vi.fn().mockReturnValue({ eq: eqChannel })

    const from = vi.fn((table: string) => {
      if (table !== 'assistant_outbound_events') return {}
      return {
        insert,
        select: selectVerify,
      }
    })

    const supabase = { from } as any

    await expect(
      deliverFinalResponse({
        supabase,
        config: {} as any,
        assistantOrgId: 'org-1',
        channelId: 'channel-1',
        channelType: 'discord',
        inboundEventId: 'inbound-1',
        conversationId: 'conversation-1',
        messageText: 'hello from failure',
        replyToExternalId: 'ext-1',
      }),
    ).rejects.toThrow('Failed to persist outbound event for inbound inbound-1')
  })
})

describe('shouldSkipDuplicateInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not skip a reclaimed inbound row when no competing rows exist', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn().mockReturnValue({ limit })
    const neq = vi.fn().mockReturnValue({ order })
    const eq3 = vi.fn().mockReturnValue({ neq })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as any

    const result = await shouldSkipDuplicateInbound({
      supabase,
      event: {
        id: 'inbound-1',
        channel_id: 'channel-1',
        external_chat_id: 'chat-1',
        external_message_id: 'msg-1',
      },
    })

    expect(result).toBe(false)
    expect(from).toHaveBeenCalledWith('assistant_inbound_events')
  })

  it('skips when another inbound row already exists for the same external message', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 'inbound-older', status: 'done', created_at: '2026-04-23T20:00:00.000Z' }],
      error: null,
    })
    const order = vi.fn().mockReturnValue({ limit })
    const neq = vi.fn().mockReturnValue({ order })
    const eq3 = vi.fn().mockReturnValue({ neq })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as any

    const result = await shouldSkipDuplicateInbound({
      supabase,
      event: {
        id: 'inbound-2',
        channel_id: 'channel-1',
        external_chat_id: 'chat-1',
        external_message_id: 'msg-1',
      },
    })

    expect(result).toBe(true)
  })
})

describe('isNonReplyingSystemEvent', () => {
  it('treats Slack system events as non-replying inbound items', () => {
    expect(
      isNonReplyingSystemEvent({
        message_data: {
          source: 'system_event',
          slack_event_type: 'reaction_added',
        },
      } as any),
    ).toBe(true)
  })

  it('does not treat regular messages as non-replying', () => {
    expect(
      isNonReplyingSystemEvent({
        message_data: {
          source: 'message',
        },
      } as any),
    ).toBe(false)
  })
})

describe('getInboundStoredMessageRole', () => {
  it('stores system events as system messages', () => {
    expect(
      getInboundStoredMessageRole({
        message_data: {
          source: 'system_event',
          slack_event_type: 'pin_added',
        },
      } as any),
    ).toBe('system')
  })

  it('stores regular inbound messages as user messages', () => {
    expect(
      getInboundStoredMessageRole({
        message_data: {
          source: 'message',
        },
      } as any),
    ).toBe('user')
  })
})

describe('Slack thread context helpers', () => {
  it('extracts hosted Slack thread policy from inbound message_data', () => {
    expect(
      getSlackThreadContextConfig({
        channel_id: 'channel-1',
        external_user_id: 'user-1',
        message_data: {
          thread_ts: '171.0001',
          slack_parent_chat_id: 'C123',
          slack_thread_history_scope: 'channel',
          slack_thread_inherit_parent: true,
          slack_thread_initial_history_limit: 12,
        },
      } as any),
    ).toEqual({
      threadTs: '171.0001',
      parentChatId: 'C123',
      historyScope: 'channel',
      inheritParent: true,
      initialHistoryLimit: 12,
    })
  })

  it('loads parent channel messages for Slack thread context when configured', async () => {
    const parentConversationMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'parent-conversation-1' },
      error: null,
    })
    const parentConversationEqActive = vi.fn().mockReturnValue({ maybeSingle: parentConversationMaybeSingle })
    const parentConversationEqChat = vi.fn().mockReturnValue({ eq: parentConversationEqActive })
    const parentConversationEqUser = vi.fn().mockReturnValue({ eq: parentConversationEqChat })
    const parentConversationEqChannel = vi.fn().mockReturnValue({ eq: parentConversationEqUser })

    const parentMessagesLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'parent-msg-2',
          role: 'assistant',
          content: 'Parent assistant reply',
          content_encrypted: null,
          content_iv: null,
          content_auth_tag: null,
          encryption_mode: 'NONE',
          key_id: null,
        },
        {
          id: 'parent-msg-1',
          role: 'user',
          content: 'Parent user message',
          content_encrypted: null,
          content_iv: null,
          content_auth_tag: null,
          encryption_mode: 'NONE',
          key_id: null,
        },
      ],
      error: null,
    })
    const parentMessagesOrder = vi.fn().mockReturnValue({ limit: parentMessagesLimit })
    const parentMessagesEqConversation = vi.fn().mockReturnValue({ order: parentMessagesOrder })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'assistant_conversations') {
          return {
            select: vi.fn().mockReturnValue({ eq: parentConversationEqChannel }),
          }
        }
        if (table === 'assistant_messages') {
          return {
            select: vi.fn().mockReturnValue({ eq: parentMessagesEqConversation }),
          }
        }
        return {}
      }),
    } as any

    const messages = await loadSlackParentContextMessages({
      supabase,
      event: {
        channel_id: 'channel-1',
        external_user_id: 'user-1',
        message_data: {
          thread_ts: '171.0001',
          slack_parent_chat_id: 'C123',
          slack_thread_history_scope: 'channel',
          slack_thread_initial_history_limit: 12,
        },
      } as any,
      conversationId: 'thread-conversation-1',
      assistant: {
        id: 'assistant-1',
        name: 'Lucid',
        org_id: 'org-1',
      } as any,
      tenantKeys: {
        tenantKey: 'tenant-1',
        sessionKey: 'session-1',
        userKey: 'user-1',
      },
      fallbackLimit: 20,
    })

    expect(messages).toEqual([
      { role: 'user', content: 'Parent user message' },
      { role: 'assistant', content: 'Parent assistant reply' },
    ])
  })
})

describe('Discord thread context helpers', () => {
  it('extracts hosted Discord thread policy from inbound message_data', () => {
    expect(
      getDiscordThreadContextConfig({
        channel_id: 'channel-1',
        external_user_id: 'user-1',
        message_data: {
          thread_id: 'thread-1',
          discord_parent_chat_id: 'discord-parent-1',
          discord_thread_history_scope: 'channel',
          discord_thread_inherit_parent: true,
          discord_thread_initial_history_limit: 8,
        },
      } as any),
    ).toEqual({
      threadId: 'thread-1',
      parentChatId: 'discord-parent-1',
      historyScope: 'channel',
      inheritParent: true,
      initialHistoryLimit: 8,
    })
  })

  it('loads parent channel messages for Discord thread context when configured', async () => {
    const parentConversationMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'parent-conversation-1' },
      error: null,
    })
    const parentConversationEqActive = vi.fn().mockReturnValue({ maybeSingle: parentConversationMaybeSingle })
    const parentConversationEqChat = vi.fn().mockReturnValue({ eq: parentConversationEqActive })
    const parentConversationEqUser = vi.fn().mockReturnValue({ eq: parentConversationEqChat })
    const parentConversationEqChannel = vi.fn().mockReturnValue({ eq: parentConversationEqUser })

    const parentMessagesLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'parent-msg-2',
          role: 'assistant',
          content: 'Parent assistant reply',
          content_encrypted: null,
          content_iv: null,
          content_auth_tag: null,
          encryption_mode: 'NONE',
          key_id: null,
        },
        {
          id: 'parent-msg-1',
          role: 'user',
          content: 'Parent user message',
          content_encrypted: null,
          content_iv: null,
          content_auth_tag: null,
          encryption_mode: 'NONE',
          key_id: null,
        },
      ],
      error: null,
    })
    const parentMessagesOrder = vi.fn().mockReturnValue({ limit: parentMessagesLimit })
    const parentMessagesEqConversation = vi.fn().mockReturnValue({ order: parentMessagesOrder })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'assistant_conversations') {
          return {
            select: vi.fn().mockReturnValue({ eq: parentConversationEqChannel }),
          }
        }
        if (table === 'assistant_messages') {
          return {
            select: vi.fn().mockReturnValue({ eq: parentMessagesEqConversation }),
          }
        }
        return {}
      }),
    } as any

    const messages = await loadDiscordParentContextMessages({
      supabase,
      event: {
        channel_id: 'channel-1',
        external_user_id: 'user-1',
        message_data: {
          thread_id: 'thread-1',
          discord_parent_chat_id: 'discord-parent-1',
          discord_thread_history_scope: 'channel',
          discord_thread_initial_history_limit: 8,
        },
      } as any,
      conversationId: 'thread-conversation-1',
      assistant: {
        id: 'assistant-1',
        name: 'Lucid',
        org_id: 'org-1',
      } as any,
      tenantKeys: {
        tenantKey: 'tenant-1',
        sessionKey: 'session-1',
        userKey: 'user-1',
      },
      fallbackLimit: 20,
    })

    expect(messages).toEqual([
      { role: 'user', content: 'Parent user message' },
      { role: 'assistant', content: 'Parent assistant reply' },
    ])
  })
})

describe('ensureInboundReplyMaterialized', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rebuilds a missing outbound event from the latest assistant reply in the conversation', async () => {
    const outboundInsertMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'outbound-repaired', channel_id: 'channel-1' },
      error: null,
    })
    const outboundInsertSelect = vi.fn().mockReturnValue({ maybeSingle: outboundInsertMaybeSingle })
    const outboundInsert = vi.fn().mockReturnValue({ select: outboundInsertSelect })

    const assistantMessagesQuery = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'assistant-msg-1',
            content: 'Recovered reply',
            content_encrypted: null,
            content_iv: null,
            content_auth_tag: null,
            encryption_mode: 'NONE',
            key_id: null,
            created_at: '2026-04-24T09:18:19.257405+00:00',
          },
        ],
        error: null,
      }),
    }

    const outboundVerifyLimit = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const outboundVerifyOrder = vi.fn().mockReturnValue({ limit: outboundVerifyLimit })
    const outboundVerifyEqInbound = vi.fn().mockReturnValue({ order: outboundVerifyOrder })
    const outboundVerifyEqChannel = vi.fn().mockReturnValue({ eq: outboundVerifyEqInbound })
    const outboundSelect = vi.fn().mockReturnValue({ eq: outboundVerifyEqChannel })

    const from = vi.fn((table: string) => {
      if (table === 'assistant_outbound_events') {
        return {
          insert: outboundInsert,
          select: outboundSelect,
        }
      }
      if (table === 'assistant_messages') {
        return {
          select: vi.fn().mockReturnValue(assistantMessagesQuery),
        }
      }
      return {}
    })

    const supabase = { from } as any

    await ensureInboundReplyMaterialized({
      supabase,
      config: {} as any,
      assistantOrgId: 'org-1',
      channel: {
        id: 'channel-1',
        channel_type: 'discord',
        assistant: {
          id: 'assistant-1',
          name: 'Shared',
          org_id: 'org-1',
        },
      } as any,
      tenantKeys: {
        tenantKey: 'tenant-1',
        sessionKey: 'session-1',
        userKey: 'user-1',
      },
      inboundEventId: 'inbound-1',
      channelId: 'channel-1',
      conversationId: 'conversation-1',
      replyToExternalId: 'ext-1',
      userMessageCreatedAt: '2026-04-24T09:18:16.687755+00:00',
    })

    expect(outboundInsert).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      inbound_event_id: 'inbound-1',
      conversation_id: 'conversation-1',
      message_text: 'Recovered reply',
      reply_to_external_id: 'ext-1',
    })
    expect(mockEnqueueOutboundEventImmediately).toHaveBeenCalledWith({
      id: 'outbound-repaired',
      channel_id: 'channel-1',
      org_id: 'org-1',
    })
  })
})

describe('repairCompletedInboundDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('can repair an inbound that is still processing when explicitly allowed', async () => {
    const inboundMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'inbound-1',
        channel_id: 'channel-1',
        external_message_id: 'ext-1',
        external_user_id: 'user-1',
        external_chat_id: 'chat-1',
        status: 'processing',
      },
      error: null,
    })
    const inboundEq = vi.fn().mockReturnValue({ maybeSingle: inboundMaybeSingle })

    const outboundVerifyMaybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'outbound-1', channel_id: 'channel-1' }, error: null })
    const outboundVerifyLimit = vi.fn().mockReturnValue({ maybeSingle: outboundVerifyMaybeSingle })
    const outboundVerifyOrder = vi.fn().mockReturnValue({ limit: outboundVerifyLimit })
    const outboundVerifyEqInbound = vi.fn().mockReturnValue({ order: outboundVerifyOrder })
    const outboundVerifyEqChannel = vi.fn().mockReturnValue({ eq: outboundVerifyEqInbound })
    const outboundSelect = vi.fn().mockReturnValue({ eq: outboundVerifyEqChannel })

    const outboundInsertMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'outbound-1', channel_id: 'channel-1' },
      error: null,
    })
    const outboundInsertSelect = vi.fn().mockReturnValue({ maybeSingle: outboundInsertMaybeSingle })
    const outboundInsert = vi.fn().mockReturnValue({ select: outboundInsertSelect })

    const channelSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'channel-1',
        assistant_id: 'assistant-1',
        channel_type: 'discord',
        external_channel_id: 'discord-channel',
        channel_config: null,
        encrypted_secrets: null,
        assistant: {
          id: 'assistant-1',
          name: 'Lucid',
          org_id: 'org-1',
        },
      },
      error: null,
    })
    const channelEq = vi.fn().mockReturnValue({ single: channelSingle })

    const userMessageMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'user-msg-1',
        conversation_id: 'conversation-1',
        created_at: '2026-04-24T09:18:16.687755+00:00',
      },
      error: null,
    })
    const userMessageLimit = vi.fn().mockReturnValue({ maybeSingle: userMessageMaybeSingle })
    const userMessageOrder = vi.fn().mockReturnValue({ limit: userMessageLimit })
    const userMessageEqExt = vi.fn().mockReturnValue({ order: userMessageOrder })
    const userMessageEqRole = vi.fn().mockReturnValue({ eq: userMessageEqExt })
    const userMessageSelect = vi.fn().mockReturnValue({ eq: userMessageEqRole })

    const assistantMessagesGte = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'assistant-msg-1',
          content: 'Recovered reply',
          content_encrypted: null,
          content_iv: null,
          content_auth_tag: null,
          encryption_mode: 'NONE',
          key_id: null,
          created_at: '2026-04-24T09:18:19.257405+00:00',
        },
      ],
      error: null,
    })
    const assistantMessagesLimit = vi.fn().mockReturnValue({ gte: assistantMessagesGte })
    const assistantMessagesOrder = vi.fn().mockReturnValue({ limit: assistantMessagesLimit })
    const assistantMessagesEqRole = vi.fn().mockReturnValue({ order: assistantMessagesOrder })
    const assistantMessagesEqConversation = vi.fn().mockReturnValue({ eq: assistantMessagesEqRole })
    const assistantMessagesSelect = vi.fn().mockReturnValue({ eq: assistantMessagesEqConversation })

    const from = vi.fn((table: string) => {
      if (table === 'assistant_inbound_events') {
        return { select: vi.fn().mockReturnValue({ eq: inboundEq }) }
      }
      if (table === 'assistant_outbound_events') {
        return {
          select: outboundSelect,
          insert: outboundInsert,
        }
      }
      if (table === 'assistant_channels') {
        return { select: vi.fn().mockReturnValue({ eq: channelEq }) }
      }
      if (table === 'assistant_messages') {
        const select = vi.fn((columns: string) => {
          if (columns.includes('conversation_id')) return { eq: userMessageEqRole }
          return { eq: assistantMessagesEqConversation }
        })
        return { select }
      }
      return {}
    })

    const supabase = { from } as any

    const repaired = await repairCompletedInboundDelivery({
      supabase,
      config: {} as any,
      eventId: 'inbound-1',
      acceptedStatuses: ['processing', 'done'],
    })

    expect(repaired).toBe(true)
    expect(outboundInsert).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      inbound_event_id: 'inbound-1',
      conversation_id: 'conversation-1',
      message_text: 'Recovered reply',
      reply_to_external_id: 'ext-1',
    })
    expect(mockEnqueueOutboundEventImmediately).toHaveBeenCalledWith({
      id: 'outbound-1',
      channel_id: 'channel-1',
      org_id: 'org-1',
    })
  })

  it('treats completed system events as already satisfied', async () => {
    const inboundMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'inbound-system-1',
        channel_id: 'channel-1',
        external_message_id: 'message_changed:171.0001',
        external_user_id: 'user-1',
        external_chat_id: 'chat-1',
        message_data: {
          source: 'system_event',
          slack_system_event: true,
          slack_event_type: 'message_changed',
        },
        status: 'done',
      },
      error: null,
    })
    const inboundEq = vi.fn().mockReturnValue({ maybeSingle: inboundMaybeSingle })

    const from = vi.fn((table: string) => {
      if (table === 'assistant_inbound_events') {
        return { select: vi.fn().mockReturnValue({ eq: inboundEq }) }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const repaired = await repairCompletedInboundDelivery({
      supabase: { from } as any,
      config: {} as any,
      eventId: 'inbound-system-1',
    })

    expect(repaired).toBe(true)
    expect(mockEnqueueOutboundEventImmediately).not.toHaveBeenCalled()
  })
})
