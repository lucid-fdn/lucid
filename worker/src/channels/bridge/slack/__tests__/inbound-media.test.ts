import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getSlackInboundAttachments,
  mapSlackFilesToAttachments,
  resolveSlackInboundAugmentation,
} from '../inbound-media.js'

describe('slack inbound media augmentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses attachment refs from inbound message_data', () => {
    const attachments = getSlackInboundAttachments({
      attachments: [
        {
          kind: 'image',
          file_id: 'file-1',
          file_name: 'chart.png',
          mime_type: 'image/png',
          url_private: 'https://files.slack.com/chart',
        },
        {
          kind: 'audio',
          file_id: 'file-2',
          file_name: 'briefing.ogg',
          mime_type: 'audio/ogg',
          url_private: 'https://files.slack.com/audio',
        },
      ],
    })

    expect(attachments).toEqual([
      expect.objectContaining({ kind: 'image', file_id: 'file-1' }),
      expect.objectContaining({ kind: 'audio', file_id: 'file-2' }),
    ])
  })

  it('normalizes raw Slack file payloads into shared attachment refs', () => {
    const attachments = mapSlackFilesToAttachments([
      {
        id: 'img-1',
        name: 'chart.png',
        mimetype: 'image/png',
        url_private: 'https://files.slack.com/chart',
      },
      {
        id: 'audio-1',
        name: 'briefing.ogg',
        mimetype: 'audio/ogg',
        filetype: 'ogg',
        url_private: 'https://files.slack.com/audio',
      },
    ])

    expect(attachments).toEqual([
      expect.objectContaining({ kind: 'image', file_id: 'img-1' }),
      expect.objectContaining({ kind: 'audio', file_id: 'audio-1' }),
    ])
  })

  it('downloads images and appends spoken context into effective text', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://files.slack.com/chart') {
        expect(init?.headers).toEqual(
          expect.objectContaining({ Authorization: 'Bearer xoxb-test' }),
        )
        return new Response(Buffer.from('image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }
      if (url === 'https://files.slack.com/audio') {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ text: 'Slack transcript.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await resolveSlackInboundAugmentation({
      messageText: 'Please review',
      messageData: {
        attachments: [
          {
            kind: 'image',
            file_id: 'img-1',
            file_name: 'chart.png',
            mime_type: 'image/png',
            url_private: 'https://files.slack.com/chart',
          },
          {
            kind: 'audio',
            file_id: 'audio-1',
            file_name: 'briefing.ogg',
            mime_type: 'audio/ogg',
            url_private: 'https://files.slack.com/audio',
          },
        ],
      },
      botToken: 'xoxb-test',
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
    expect(result.effectiveText).toContain('Slack transcript.')
  })
})
