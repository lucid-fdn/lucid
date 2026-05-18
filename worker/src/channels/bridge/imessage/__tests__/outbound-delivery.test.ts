import { afterEach, describe, expect, it, vi } from 'vitest'

const sendMessageIMessage = vi.fn()

vi.mock('../../openclaw-channel-shim.js', () => ({
  sendMessageIMessage: (...args: unknown[]) => sendMessageIMessage(...args),
}))

describe('handleIMessageOutbound', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends to the stored iMessage target with reply threading and explicit relay config', async () => {
    sendMessageIMessage.mockResolvedValueOnce({ messageId: 'imsg-1' })

    const { handleIMessageOutbound } = await import('../outbound-delivery.js')
    const messageId = await handleIMessageOutbound({
      channel: {
        id: 'channel-1',
        external_channel_id: '+15555550124',
        channel_config: {
          imessage_service: 'imessage',
          imessage_region: 'US',
        },
      },
      event: {
        inbound_event_id: 'inbound-1',
        message_text: 'hello from worker',
        reply_to_external_id: 'reply-123',
      },
      secrets: {
        cli_path: '/usr/local/bin/imsg',
        db_path: '/tmp/chat.db',
      },
      loadInboundMessageData: vi.fn(),
    })

    expect(messageId).toBe('imsg-1')
    expect(sendMessageIMessage).toHaveBeenCalledWith(
      '+15555550124',
      'hello from worker',
      {
        cliPath: '/usr/local/bin/imsg',
        dbPath: '/tmp/chat.db',
        service: 'imessage',
        region: 'US',
        replyToId: 'reply-123',
      },
    )
  })

  it('falls back to inbound message metadata when the channel has no fixed target', async () => {
    sendMessageIMessage.mockResolvedValueOnce({ messageId: 'imsg-2' })

    const { handleIMessageOutbound } = await import('../outbound-delivery.js')
    const messageId = await handleIMessageOutbound({
      channel: {
        id: 'channel-1',
        external_channel_id: null,
        channel_config: null,
      },
      event: {
        inbound_event_id: 'inbound-2',
        message_text: 'hello from default route',
        reply_to_external_id: null,
      },
      secrets: {},
      loadInboundMessageData: vi.fn().mockResolvedValue({
        imessage_target: 'chat_id:42',
      }),
    })

    expect(messageId).toBe('imsg-2')
    expect(sendMessageIMessage).toHaveBeenCalledWith(
      'chat_id:42',
      'hello from default route',
      {},
    )
  })

  it('enqueues hosted provider dispatches instead of sending locally', async () => {
    const enqueueHostedDispatch = vi.fn().mockResolvedValue('dispatch-1')

    const { handleIMessageOutbound } = await import('../outbound-delivery.js')
    const messageId = await handleIMessageOutbound({
      channel: {
        id: 'channel-hosted-1',
        external_channel_id: null,
        connection_mode: 'hosted',
        channel_config: {
          hosted_surface_id: 'surface-1',
        },
      },
      event: {
        inbound_event_id: 'inbound-hosted-1',
        message_text: 'hello from hosted dispatch',
        reply_to_external_id: 'reply-xyz',
      },
      secrets: {},
      loadInboundMessageData: vi.fn().mockResolvedValue({
        imessage_target: 'chat_guid:foo',
      }),
      enqueueHostedDispatch,
    })

    expect(messageId).toBe('provider-dispatch:dispatch-1')
    expect(enqueueHostedDispatch).toHaveBeenCalledWith({
      surfaceId: 'surface-1',
      body: {
        target: 'chat_guid:foo',
        text: 'hello from hosted dispatch',
        replyToId: 'reply-xyz',
        inboundEventId: 'inbound-hosted-1',
      },
    })
    expect(sendMessageIMessage).not.toHaveBeenCalled()
  })
})
