import { describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram/mini-app'

vi.mock('server-only', () => ({}))

function buildInitData(botToken: string, data: Record<string, string>) {
  const pairs = Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex')
  const params = new URLSearchParams(data)
  params.set('hash', hash)
  return params.toString()
}

describe('verifyTelegramMiniAppInitData', () => {
  it('accepts valid Telegram init data', () => {
    const botToken = 'test-bot-token'
    const initData = buildInitData(botToken, {
      auth_date: '1713110400',
      chat: JSON.stringify({ id: 200, type: 'private' }),
      chat_instance: 'abc',
      user: JSON.stringify({ id: 100 }),
    })

    expect(verifyTelegramMiniAppInitData(initData, botToken)).toEqual({
      chatId: '200',
      chatType: 'private',
      queryId: null,
      userId: '100',
    })
  })

  it('rejects invalid hashes', () => {
    const initData = new URLSearchParams({
      auth_date: '1713110400',
      chat: JSON.stringify({ id: 200, type: 'private' }),
      chat_instance: 'abc',
      user: JSON.stringify({ id: 100 }),
      hash: 'invalid',
    }).toString()

    expect(verifyTelegramMiniAppInitData(initData, 'test-bot-token')).toBeNull()
  })

  it('falls back to the user private chat when chat metadata is absent', () => {
    const botToken = 'test-bot-token'
    const initData = buildInitData(botToken, {
      auth_date: '1713110400',
      query_id: 'abc',
      user: JSON.stringify({ id: 100 }),
    })

    expect(verifyTelegramMiniAppInitData(initData, botToken)).toEqual({
      chatId: '100',
      chatType: 'private',
      queryId: 'abc',
      userId: '100',
    })
  })
})
