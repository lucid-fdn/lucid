import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessageTelegram = vi.fn()
const editMessageTelegram = vi.fn()
const reactMessageTelegram = vi.fn()
const sendStickerTelegram = vi.fn()

vi.mock('../../openclaw-channel-shim.js', () => ({
  sendMessageTelegram: (...args: unknown[]) => sendMessageTelegram(...args),
  editMessageTelegram: (...args: unknown[]) => editMessageTelegram(...args),
  reactMessageTelegram: (...args: unknown[]) => reactMessageTelegram(...args),
  sendStickerTelegram: (...args: unknown[]) => sendStickerTelegram(...args),
}))

describe('TelegramPlugin', () => {
  beforeEach(() => {
    sendMessageTelegram.mockReset()
    editMessageTelegram.mockReset()
    reactMessageTelegram.mockReset()
    sendStickerTelegram.mockReset()
  })

  it('forces plain text mode for sendText and editText', async () => {
    const { createTelegramPlugin } = await import('../TelegramPlugin.js')
    sendMessageTelegram.mockResolvedValueOnce({ messageId: '1', chatId: 'chat-1' })
    editMessageTelegram.mockResolvedValueOnce({ messageId: '1', chatId: 'chat-1' })

    const plugin = createTelegramPlugin({ bot_token: 'token' })
    await plugin.outbound.sendText({
      to: 'chat-1',
      text: 'hello',
      platformOptions: { link_preview_options: { is_disabled: true } },
    })
    await plugin.outbound.editText({
      to: 'chat-1',
      messageId: '1',
      text: 'hello again',
    })

    expect(sendMessageTelegram).toHaveBeenCalledWith('chat-1', 'hello', {
      token: 'token',
      textMode: 'plain',
      link_preview_options: { is_disabled: true },
    })
    expect(editMessageTelegram).toHaveBeenCalledWith('chat-1', '1', 'hello again', {
      token: 'token',
      textMode: 'plain',
    })
  })
})
