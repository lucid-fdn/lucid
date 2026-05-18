import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDiscordInboundAttachments,
  resolveDiscordInboundAugmentation,
} from '../inbound-media.js'

describe('discord inbound media augmentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses attachment refs from inbound message_data', () => {
    const attachments = getDiscordInboundAttachments({
      discord_attachments: [
        {
          kind: 'image',
          id: 'img-1',
          fileName: 'chart.png',
          mimeType: 'image/png',
          url: 'https://cdn.discordapp.com/chart.png',
        },
        {
          kind: 'audio',
          id: 'audio-1',
          fileName: 'briefing.ogg',
          mimeType: 'audio/ogg',
          url: 'https://cdn.discordapp.com/briefing.ogg',
        },
      ],
    })

    expect(attachments).toEqual([
      expect.objectContaining({ kind: 'image', id: 'img-1' }),
      expect.objectContaining({ kind: 'audio', id: 'audio-1' }),
    ])
  })

  it('downloads images and appends spoken context into effective text', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://cdn.discordapp.com/chart.png') {
        expect(init).toBeUndefined()
        return new Response(Buffer.from('image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }
      if (url === 'https://cdn.discordapp.com/briefing.ogg') {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ text: 'Discord transcript.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await resolveDiscordInboundAugmentation({
      messageText: 'Please review',
      messageData: {
        discord_attachments: [
          {
            kind: 'image',
            id: 'img-1',
            fileName: 'chart.png',
            mimeType: 'image/png',
            url: 'https://cdn.discordapp.com/chart.png',
          },
          {
            kind: 'audio',
            id: 'audio-1',
            fileName: 'briefing.ogg',
            mimeType: 'audio/ogg',
            url: 'https://cdn.discordapp.com/briefing.ogg',
          },
        ],
      },
      llmBaseUrl: 'https://api.example.com/v1',
      llmApiKey: 'sk-test',
    })

    expect(result.images).toEqual([
      expect.objectContaining({
        mimeType: 'image/png',
        data: Buffer.from('image-bytes').toString('base64'),
      }),
    ])
    expect(result.effectiveText).toContain('Please review')
    expect(result.effectiveText).toContain('Additional spoken context:')
    expect(result.effectiveText).toContain('Discord transcript.')
  })
})
