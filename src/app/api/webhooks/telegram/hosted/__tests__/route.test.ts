/**
 * Integration tests for the hosted Telegram webhook route.
 *
 * Mocks the DB + outbound fetch boundaries and asserts the routing decisions
 * the spec cares about: deep-link bind, /switch keyboard, replay dedupe across
 * primary swap, and share-disabled blocking.
 *
 * Spec: docs/superpowers/specs/2026-04-07-telegram-multi-agent-deep-link-design.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockBindAgentToChatViaShare = vi.fn()
const mockGetAssistant = vi.fn()
const mockHasTelegramInboundForChatMessage = vi.fn()
const mockInsertAssistantInboundEvent = vi.fn()
const mockListTelegramChannelsForChat = vi.fn()
const mockListTelegramWorkspacesForChat = vi.fn()
const mockGetPrimaryTelegramChannelForChat = vi.fn()
const mockGetTelegramChatScope = vi.fn()
const mockPersistTelegramChatScope = vi.fn()
const mockSetPrimaryTelegramChannel = vi.fn()
const mockSwitchTelegramChatWorkspace = vi.fn()
const mockUpsertHostedTelegramChannel = vi.fn()
const mockConsumeTelegramConnectToken = vi.fn()
const mockPeekTelegramConnectToken = vi.fn()

vi.mock('@/lib/db', () => ({
  bindAgentToChatViaShare: (...args: unknown[]) => mockBindAgentToChatViaShare(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  hasTelegramInboundForChatMessage: (...args: unknown[]) =>
    mockHasTelegramInboundForChatMessage(...args),
  insertAssistantInboundEvent: (...args: unknown[]) => mockInsertAssistantInboundEvent(...args),
  listTelegramChannelsForChat: (...args: unknown[]) => mockListTelegramChannelsForChat(...args),
  listTelegramWorkspacesForChat: (...args: unknown[]) =>
    mockListTelegramWorkspacesForChat(...args),
  getPrimaryTelegramChannelForChat: (...args: unknown[]) =>
    mockGetPrimaryTelegramChannelForChat(...args),
  getTelegramChatScope: (...args: unknown[]) => mockGetTelegramChatScope(...args),
  persistTelegramChatScope: (...args: unknown[]) => mockPersistTelegramChatScope(...args),
  setPrimaryTelegramChannel: (...args: unknown[]) => mockSetPrimaryTelegramChannel(...args),
  switchTelegramChatWorkspace: (...args: unknown[]) => mockSwitchTelegramChatWorkspace(...args),
  upsertHostedTelegramChannel: (...args: unknown[]) => mockUpsertHostedTelegramChannel(...args),
  consumeTelegramConnectToken: (...args: unknown[]) => mockConsumeTelegramConnectToken(...args),
  peekTelegramConnectToken: (...args: unknown[]) => mockPeekTelegramConnectToken(...args),
  // unbind not used in these tests but imported transitively by command handlers
  unbindTelegramChannel: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/logging/telegram-server-log', () => ({
  appendTelegramServerLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishWakeForChannel: vi.fn().mockResolvedValue(undefined),
}))

const ASSISTANT_A = '11111111-2222-3333-4444-555555555555'
const ASSISTANT_B = '99999999-8888-7777-6666-555555555555'
const SECRET = 'test-webhook-secret'

const fetchMock = vi.fn()

function stripTelegramHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '')
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TELEGRAM_HOSTED_BOT_TOKEN = 'test-bot-token'
  process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET = SECRET
  process.env.WORKER_URL = 'http://worker.test'
  mockGetTelegramChatScope.mockReset()
  mockListTelegramWorkspacesForChat.mockReset()
  mockPersistTelegramChatScope.mockReset()
  mockSwitchTelegramChatWorkspace.mockReset()
  mockPeekTelegramConnectToken.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})

function buildUpdate(body: Record<string, unknown>) {
  return new Request('http://localhost/api/webhooks/telegram/hosted', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': SECRET,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/webhooks/telegram/hosted', () => {
  describe('/start agent_<uuid> deep link', () => {
    it('binds and replies on success', async () => {
      mockBindAgentToChatViaShare.mockResolvedValue({
        ok: true,
        channelId: 'ch-1',
        assistantId: ASSISTANT_A,
      })
      mockGetAssistant.mockResolvedValue({ id: ASSISTANT_A, name: 'Alice', org_id: 'org-a' })

      const { POST } = await import('../route')
      const res = await POST(
        buildUpdate({
          update_id: 1,
          message: {
            message_id: 10,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: `/start agent_${ASSISTANT_A}`,
            date: 0,
          },
        }) as never,
      )

      expect(res.status).toBe(200)
      expect(mockBindAgentToChatViaShare).toHaveBeenCalledWith(
        expect.objectContaining({
          assistantId: ASSISTANT_A,
          chatId: '200',
        }),
      )
      // telegramUserId is no longer passed — the org-wide token bypass was
      // removed (share_enabled is now the only gate for deep-link binds).
      const bindArg = mockBindAgentToChatViaShare.mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(bindArg).not.toHaveProperty('telegramUserId')
      const sendCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/sendMessage'),
      )
      expect(sendCalls.length).toBe(1)
      expect(mockPersistTelegramChatScope).toHaveBeenCalledWith('200', 'org-a')
      const body = JSON.parse(sendCalls[0][1].body)
      expect(stripTelegramHtml(body.text)).toMatch(/entered Alice's room/i)
      expect(body.reply_markup).toBeDefined()
    })

    it('replies with shareDisabled when bind blocked by share flag', async () => {
      mockGetAssistant.mockResolvedValue({ id: ASSISTANT_A, name: 'Alice', org_id: 'org-a' })
      mockBindAgentToChatViaShare.mockResolvedValue({
        ok: false,
        error: 'share_disabled',
      })

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 2,
          message: {
            message_id: 11,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: `/start agent_${ASSISTANT_A}`,
            date: 0,
          },
        }) as never,
      )

      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(sendBody.text).toMatch(/private/i)
    })

    it('asks for confirmation before switching workspace on cross-scope share bind', async () => {
      mockGetAssistant.mockResolvedValue({ id: ASSISTANT_A, name: 'Alice', org_id: 'org-b' })
      mockGetTelegramChatScope.mockResolvedValue({ orgId: 'org-a', assistantId: ASSISTANT_B })

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 21,
          message: {
            message_id: 31,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: `/start agent_${ASSISTANT_A}`,
            date: 0,
          },
        }) as never,
      )

      expect(mockBindAgentToChatViaShare).not.toHaveBeenCalled()
      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(stripTelegramHtml(sendBody.text)).toMatch(/Current workspace/i)
      expect(sendBody.reply_markup.inline_keyboard[0][0].callback_data).toBe(`scopea:${ASSISTANT_A}`)
    })

    it('blocks deep link in group chats', async () => {
      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 3,
          message: {
            message_id: 12,
            from: { id: 100 },
            chat: { id: -200, type: 'group' },
            text: `/start agent_${ASSISTANT_A}`,
            date: 0,
          },
        }) as never,
      )

      expect(mockBindAgentToChatViaShare).not.toHaveBeenCalled()
      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(sendBody.text).toMatch(/private/i)
    })

    it('drops /start (no payload) in groups without replying', async () => {
      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 4,
          message: {
            message_id: 13,
            from: { id: 100 },
            chat: { id: -200, type: 'group' },
            text: '/start',
            date: 0,
          },
        }) as never,
      )

      const sendCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/sendMessage'),
      )
      expect(sendCalls.length).toBe(0)
    })
  })

  describe('/switch via callback_query', () => {
    it('swaps primary and refreshes the keyboard', async () => {
      mockSetPrimaryTelegramChannel.mockResolvedValue({ ok: true })
      mockListTelegramChannelsForChat.mockResolvedValue([
        {
          id: 'ch-1',
          assistant_id: ASSISTANT_A,
          assistant_name: 'Alice',
          is_primary: true,
        },
        {
          id: 'ch-2',
          assistant_id: ASSISTANT_B,
          assistant_name: 'Bob',
          is_primary: false,
        },
      ])

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 5,
          callback_query: {
            id: 'cb-1',
            from: { id: 100 },
            message: {
              message_id: 14,
              chat: { id: 200, type: 'private' },
            },
            data: `switch:${ASSISTANT_A}`,
          },
        }) as never,
      )

      expect(mockSetPrimaryTelegramChannel).toHaveBeenCalledWith('200', ASSISTANT_A)
      const editCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/editMessageText'),
      )
      expect(editCall).toBeDefined()
      const editBody = JSON.parse(editCall![1].body)
      expect(editBody.reply_markup.inline_keyboard).toHaveLength(2)
    })

    it('rejects callback_query in group chats', async () => {
      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 6,
          callback_query: {
            id: 'cb-2',
            from: { id: 100 },
            message: {
              message_id: 15,
              chat: { id: -200, type: 'group' },
            },
            data: `switch:${ASSISTANT_A}`,
          },
        }) as never,
      )

      expect(mockSetPrimaryTelegramChannel).not.toHaveBeenCalled()
    })

    it('confirms workspace switch via callback before binding a shared agent', async () => {
      mockGetAssistant.mockResolvedValue({
        id: ASSISTANT_A,
        name: 'Alice',
        org_id: 'org-a',
        description: 'Closer',
        telegram_display_name: 'Alice',
        telegram_role_title: 'Closer',
        telegram_essence: 'Converts leads.',
        telegram_starter_prompts: ['Say hi'],
      })
      mockBindAgentToChatViaShare.mockResolvedValue({
        ok: true,
        channelId: 'ch-1',
        assistantId: ASSISTANT_A,
      })
      mockListTelegramWorkspacesForChat.mockResolvedValue([
        { org_id: 'org-a', org_name: 'Alpha', agent_count: 1, is_current: true },
        { org_id: 'org-b', org_name: 'Beta', agent_count: 2, is_current: false },
      ])

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 22,
          callback_query: {
            id: 'cb-3',
            from: { id: 100 },
            message: {
              message_id: 16,
              chat: { id: 200, type: 'private' },
            },
            data: `scopea:${ASSISTANT_A}`,
          },
        }) as never,
      )

      expect(mockBindAgentToChatViaShare).toHaveBeenCalledWith(
        expect.objectContaining({ assistantId: ASSISTANT_A, chatId: '200' }),
      )
      const editBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))![1].body,
      )
      expect(stripTelegramHtml(editBody.text)).toMatch(/Current workspace: Alpha/)
      expect(stripTelegramHtml(editBody.text)).toMatch(/Active now: Alice/)
      expect(editBody.reply_markup.inline_keyboard[0][0].text).toMatch(/^✅ Alpha/)
      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(stripTelegramHtml(sendBody.text)).toMatch(/You've entered Alice's room/i)
    })

    it('switches workspace via callback for an existing linked workspace', async () => {
      mockSwitchTelegramChatWorkspace.mockResolvedValue({ ok: true, assistantId: ASSISTANT_B })
      mockListTelegramWorkspacesForChat.mockResolvedValue([
        { org_id: 'org-a', org_name: 'Alpha', agent_count: 2, is_current: false },
        { org_id: 'org-b', org_name: 'Beta', agent_count: 1, is_current: true },
      ])
      mockGetAssistant.mockResolvedValue({ id: ASSISTANT_B, name: 'Bob', telegram_display_name: 'Lead Hunter' })

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 24,
          callback_query: {
            id: 'cb-4',
            from: { id: 100 },
            message: {
              message_id: 17,
              chat: { id: 200, type: 'private' },
            },
            data: 'workspace:99999999-8888-7777-6666-555555555555',
          },
        }) as never,
      )

      expect(mockSwitchTelegramChatWorkspace).toHaveBeenCalledWith(
        '200',
        '99999999-8888-7777-6666-555555555555',
      )
      const editBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))![1].body,
      )
      expect(stripTelegramHtml(editBody.text)).toMatch(/Current workspace: Beta/)
      expect(stripTelegramHtml(editBody.text)).toMatch(/Active now: Lead Hunter/)
      expect(editBody.reply_markup.inline_keyboard[1][0].text).toMatch(/^✅ Beta/)
    })
  })

  it('posts a persistent confirmation message after workspace callback switch', async () => {
    mockSwitchTelegramChatWorkspace.mockResolvedValue({ ok: true, assistantId: ASSISTANT_B })
    mockListTelegramWorkspacesForChat.mockResolvedValue([
      { org_id: 'org-a', org_name: 'Alpha', agent_count: 2, is_current: false },
      { org_id: 'org-b', org_name: 'Beta', agent_count: 1, is_current: true },
    ])
    mockGetAssistant.mockResolvedValue({ id: ASSISTANT_B, name: 'Bob', telegram_display_name: 'Lead Hunter' })

    const { POST } = await import('../route')
    await POST(
      buildUpdate({
        update_id: 25,
        callback_query: {
          id: 'cb-5',
          from: { id: 100 },
          message: {
            message_id: 18,
            chat: { id: 200, type: 'private' },
          },
          data: 'workspace:99999999-8888-7777-6666-555555555555',
        },
      }) as never,
    )

    const sendBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/sendMessage'))
      .map(([, init]) => JSON.parse(init.body))
    expect(sendBodies.some((body) => /Active now: Lead Hunter/.test(stripTelegramHtml(body.text)))).toBe(true)
  })

  describe('plain message routing', () => {
    it('routes Mini App quick actions through the same command handlers', async () => {
      mockGetPrimaryTelegramChannelForChat.mockResolvedValue({
        id: 'ch-1',
        assistant_id: ASSISTANT_A,
      })
      mockListTelegramChannelsForChat.mockResolvedValue([
        {
          id: 'ch-1',
          assistant_id: ASSISTANT_A,
          assistant_name: 'Alice',
          assistant_role_title: 'Closer',
          assistant_essence: 'Converts leads.',
          is_primary: true,
        },
      ])

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 70,
          message: {
            message_id: 160,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            web_app_data: {
              data: JSON.stringify({ action: 'command', command: '/whoami' }),
            },
            date: 0,
          },
        }) as never,
      )

      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(stripTelegramHtml(sendBody.text)).toMatch(/Active now: Alice/i)
      expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
    })

    it('treats the reply-keyboard /switch launcher as an in-chat command', async () => {
      mockListTelegramChannelsForChat.mockResolvedValue([
        { id: 'c1', assistant_id: ASSISTANT_A, assistant_name: 'Alice', is_primary: false },
      ])

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 7,
          message: {
            message_id: 16,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: '/switch',
            date: 0,
          },
        }) as never,
      )

      expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(stripTelegramHtml(sendBody.text)).toMatch(/Choose the next active agent/i)
      expect(sendBody.reply_markup.inline_keyboard).toBeDefined()
    })

    it('routes to primary channel', async () => {
      mockGetPrimaryTelegramChannelForChat.mockResolvedValue({
        id: 'ch-1',
        assistant_id: ASSISTANT_A,
      })
      mockHasTelegramInboundForChatMessage.mockResolvedValue(false)
      mockInsertAssistantInboundEvent.mockResolvedValue(undefined)

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 7,
          message: {
            message_id: 16,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: 'hello agent',
            date: 0,
          },
        }) as never,
      )

      expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'ch-1',
          external_chat_id: '200',
          message_text: 'hello agent',
        }),
      )
    })

    it('queues photo-only messages with attachment metadata instead of dropping them', async () => {
      mockGetPrimaryTelegramChannelForChat.mockResolvedValue({
        id: 'ch-1',
        assistant_id: ASSISTANT_A,
      })
      mockHasTelegramInboundForChatMessage.mockResolvedValue(false)
      mockInsertAssistantInboundEvent.mockResolvedValue(undefined)

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 71,
          message: {
            message_id: 161,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            caption: 'look at this',
            photo: [
              { file_id: 'small' },
              { file_id: 'large', width: 1024, height: 768 },
            ],
            date: 0,
          },
        }) as never,
      )

      expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'ch-1',
          message_text: 'look at this\n\nUser sent an image.',
          message_data: expect.objectContaining({
            telegram_ingress_preprocessed: true,
            attachments: [
              expect.objectContaining({
                kind: 'image',
                file_id: 'large',
                width: 1024,
                height: 768,
              }),
            ],
          }),
        }),
      )
    })

    it('drops replays after a primary swap', async () => {
      mockGetPrimaryTelegramChannelForChat.mockResolvedValue({
        id: 'ch-2',
        assistant_id: ASSISTANT_B,
      })
      mockHasTelegramInboundForChatMessage.mockResolvedValue(true)

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 8,
          message: {
            message_id: 17,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: 'hello again',
            date: 0,
          },
        }) as never,
      )

      expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
    })

    it('shows onboarding when no bindings', async () => {
      mockGetPrimaryTelegramChannelForChat.mockResolvedValue(null)
      mockListTelegramChannelsForChat.mockResolvedValue([])

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 9,
          message: {
            message_id: 18,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: 'anyone there?',
            date: 0,
          },
        }) as never,
      )

      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(sendBody.text).toMatch(/edge of Lucid/i)
      expect(sendBody.reply_markup).toBeDefined()
      expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
    })
  })

  describe('/start connect token scope handling', () => {
    it('asks for confirmation before switching workspace on cross-scope token bind', async () => {
      mockPeekTelegramConnectToken.mockResolvedValue({ assistantId: ASSISTANT_A, orgId: 'org-b' })
      mockGetTelegramChatScope.mockResolvedValue({ orgId: 'org-a', assistantId: ASSISTANT_B })
      mockGetAssistant.mockResolvedValue({ id: ASSISTANT_A, name: 'Alice', org_id: 'org-b' })

      const { POST } = await import('../route')
      await POST(
        buildUpdate({
          update_id: 23,
          message: {
            message_id: 32,
            from: { id: 100 },
            chat: { id: 200, type: 'private' },
            text: `/start ${ASSISTANT_A}`,
            date: 0,
          },
        }) as never,
      )

      expect(mockConsumeTelegramConnectToken).not.toHaveBeenCalled()
      const sendBody = JSON.parse(
        fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))![1].body,
      )
      expect(sendBody.reply_markup.inline_keyboard[0][0].callback_data).toBe(`scopet:${ASSISTANT_A}`)
    })
  })
}, 20_000)
