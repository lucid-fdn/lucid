import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface TelegramMiniAppContext {
  chatId: string
  chatType: string | null
  userId: string
  queryId: string | null
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function verifyTelegramMiniAppInitData(
  initData: string,
  botToken: string,
): TelegramMiniAppContext | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  const pairs: string[] = []
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue
    pairs.push(`${key}=${value}`)
  }
  pairs.sort()

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex')

  const incoming = Buffer.from(hash, 'utf8')
  const target = Buffer.from(expected, 'utf8')
  if (incoming.length !== target.length) return null
  if (!timingSafeEqual(incoming, target)) return null

  const user = safeParseJson<{ id?: number | string }>(params.get('user'))
  const chat = safeParseJson<{ id?: number | string; type?: string }>(params.get('chat'))
  const queryId = params.get('query_id')

  if (!user?.id) return null

  const chatId = chat?.id ? String(chat.id) : String(user.id)
  const chatType = typeof chat?.type === 'string' ? chat.type : 'private'

  return {
    chatId,
    chatType,
    userId: String(user.id),
    queryId,
  }
}
