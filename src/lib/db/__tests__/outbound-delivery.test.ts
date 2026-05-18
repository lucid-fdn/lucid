import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'

const fromMock = vi.fn()
const eqMock = vi.fn()
const singleMock = vi.fn()
const captureExceptionMock = vi.fn()
const adapterSendMock = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
  },
}))

vi.mock('@/lib/features', () => ({
  FEATURES: {
    openclawChannelsTelegramManaged: true,
    openclawChannelsWhatsAppManaged: true,
    openclawChannelsDiscordManaged: true,
    openclawChannelsIMessageManaged: true,
    openclawChannelsSlackManaged: true,
    openclawChannelsTeamsManaged: true,
  },
}))

vi.mock('@/lib/channels/openclaw/OpenClawRelayTransport', () => ({
  getOpenClawRelayTransport: () => ({
    send: (...args: unknown[]) => adapterSendMock(...args),
  }),
}))

describe('deliverOutbound managed transport fallback', () => {
  const encryptSecrets = (payload: Record<string, string>, encryptionKey: string) => {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv)
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
  }

  beforeEach(() => {
    vi.resetModules()
    fromMock.mockReset()
    eqMock.mockReset()
    singleMock.mockReset()
    captureExceptionMock.mockReset()
    adapterSendMock.mockReset()
    vi.stubEnv('TELEGRAM_HOSTED_BOT_TOKEN', 'test-bot-token')
    vi.stubEnv('ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')

    singleMock.mockResolvedValue({
      data: {
        id: 'channel-1',
        assistant_id: 'assistant-1',
        channel_type: 'telegram',
        external_channel_id: '853247773',
        channel_config: {},
        encrypted_secrets: null,
      },
      error: null,
    })
    eqMock.mockReturnValue({ single: singleMock })
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: eqMock,
      }),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 999 } }),
        text: async () => '',
      } as Response),
    )
  })

  it('falls back to legacy Telegram sender when openclaw runtime package is unavailable', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'channel-1',
        assistant_id: 'assistant-1',
        channel_type: 'telegram',
        external_channel_id: '853247773',
        channel_config: {},
        encrypted_secrets: {
          id: 'secret-1',
          encrypted_data: encryptSecrets(
            { bot_token: 'byob-telegram-token' },
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          ),
        },
      },
      error: null,
    })
    adapterSendMock.mockRejectedValue(
      new Error("Cannot find package '@lucid/openclaw-runtime' imported from /var/task/.next/server/chunks/72612.js"),
    )

    const mod = await import('../outbound-delivery')
    const result = await mod.deliverOutbound('channel-1', 'hello', '222')

    expect(result).toEqual({ delivered: true, externalMessageId: '999' })
    expect(adapterSendMock).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })

  it('routes hosted Telegram through managed transport with direct fallback preserved', async () => {
    adapterSendMock.mockResolvedValueOnce({
      delivered: true,
      externalMessageId: 'managed-telegram-999',
    })

    const mod = await import('../outbound-delivery')
    const result = await mod.deliverOutbound('channel-1', 'hello', '222')

    expect(result).toEqual({ delivered: true, externalMessageId: 'managed-telegram-999' })
    expect(adapterSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: '853247773',
        messageText: 'hello',
        replyToExternalId: '222',
        secrets: { bot_token: 'test-bot-token' },
      }),
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('passes assistant identity to the managed Slack transport', async () => {
    singleMock
      .mockResolvedValueOnce({
        data: {
          id: 'channel-slack-1',
          assistant_id: 'assistant-slack-1',
          channel_type: 'slack',
          external_channel_id: 'C123456',
          channel_config: {},
          encrypted_secrets: {
            id: 'secret-slack-1',
            encrypted_data: encryptSecrets(
              { bot_token: 'xoxb-managed-slack' },
              '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            ),
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'assistant-slack-1',
          name: 'Sales Agent',
        },
        error: null,
      })

    adapterSendMock.mockResolvedValueOnce({
      delivered: true,
      externalMessageId: '1712345678.001',
    })

    const mod = await import('../outbound-delivery')
    const result = await mod.deliverOutbound('channel-slack-1', 'hello from lucid', null)

    expect(result).toEqual({
      delivered: true,
      externalMessageId: '1712345678.001',
    })
    expect(adapterSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: 'C123456',
        messageText: 'hello from lucid',
        identity: { username: 'Sales Agent' },
      }),
    )
  })

  it('routes WhatsApp through the managed transport using the stored chat id as destination', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'channel-whatsapp-1',
        assistant_id: 'assistant-whatsapp-1',
        channel_type: 'whatsapp',
        external_channel_id: '+15555550123',
        channel_config: {},
        encrypted_secrets: {
          id: 'secret-whatsapp-1',
          encrypted_data: encryptSecrets(
            { access_token: 'wa-token', phone_number_id: '12345' },
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          ),
        },
      },
      error: null,
    })

    adapterSendMock.mockResolvedValueOnce({
      delivered: true,
      externalMessageId: 'wamid.abc123',
    })

    const mod = await import('../outbound-delivery')
    const result = await mod.deliverOutbound('channel-whatsapp-1', 'hello on whatsapp', 'reply-id-ignored')

    expect(result).toEqual({
      delivered: true,
      externalMessageId: 'wamid.abc123',
    })
    expect(adapterSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: '+15555550123',
        messageText: 'hello on whatsapp',
      }),
    )
  })

  it('routes iMessage through the managed transport using the stored target and relay config', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'channel-imessage-1',
        assistant_id: 'assistant-imessage-1',
        channel_type: 'imessage',
        external_channel_id: '+15555550124',
        channel_config: {
          imessage_service: 'imessage',
          imessage_region: 'US',
        },
        encrypted_secrets: {
          id: 'secret-imessage-1',
          encrypted_data: encryptSecrets(
            { cli_path: '/usr/local/bin/imsg', db_path: '/tmp/chat.db' },
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          ),
        },
      },
      error: null,
    })

    adapterSendMock.mockResolvedValueOnce({
      delivered: true,
      externalMessageId: 'imsg-123',
    })

    const mod = await import('../outbound-delivery')
    const result = await mod.deliverOutbound('channel-imessage-1', 'hello on imessage', 'reply-123')

    expect(result).toEqual({
      delivered: true,
      externalMessageId: 'imsg-123',
    })
    expect(adapterSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: '+15555550124',
        messageText: 'hello on imessage',
        replyToExternalId: 'reply-123',
        secrets: {
          cli_path: '/usr/local/bin/imsg',
          db_path: '/tmp/chat.db',
        },
        channelConfig: {
          imessage_service: 'imessage',
          imessage_region: 'US',
        },
      }),
    )
  })
})
