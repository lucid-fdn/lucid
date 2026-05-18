import { describe, expect, it, vi } from 'vitest'

import { resolveTelegramDelivery } from '../delivery.js'

describe('telegram delivery resolution', () => {
  it('returns plain delivery when there is no sender assistant id', async () => {
    const supabase = { from: vi.fn() } as any

    await expect(
      resolveTelegramDelivery({
        supabase,
        channel: {
          assistant_id: null,
          external_channel_id: 'chat-1',
          ai_assistants: { name: 'Hosted' },
        },
        text: 'hello',
        hosted: true,
      }),
    ).resolves.toEqual({
      chatId: 'chat-1',
      text: 'hello',
      platformOptions: { link_preview_options: { is_disabled: true } },
    })
  })

  it('decorates hosted speaker delivery when another room primary is active', async () => {
    const roomBindings = [
      {
        id: 'ch-primary',
        assistant_id: 'assistant-primary',
        is_primary: true,
        ai_assistants: { name: 'Primary', telegram_display_name: 'Current Agent' },
      },
      {
        id: 'ch-sender',
        assistant_id: 'assistant-sender',
        is_primary: false,
        ai_assistants: { name: 'Analyst', telegram_display_name: 'Lucid First Agent' },
      },
    ]

    const listEqChat = vi.fn().mockResolvedValue({ data: roomBindings, error: null })
    const listEqActive = vi.fn(() => ({ eq: listEqChat }))
    const listEqType = vi.fn(() => ({ eq: listEqActive }))
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(() => ({ eq: listEqType })),
      }),
    } as any

    await expect(
      resolveTelegramDelivery({
        supabase,
        channel: {
          assistant_id: 'assistant-sender',
          external_channel_id: 'chat-1',
          ai_assistants: { name: 'Analyst', telegram_display_name: 'Lucid First Agent' },
        },
        text: 'Signal flipped bearish.',
        hosted: true,
      }),
    ).resolves.toEqual({
      chatId: 'chat-1',
      text: '<b>Message from Lucid First Agent</b>\n\nSignal flipped bearish.',
      platformOptions: {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'Switch to Lucid First Agent',
              callback_data: 'switch:assistant-sender',
              style: 'primary',
            },
          ]],
        },
      },
    })
  })
})
