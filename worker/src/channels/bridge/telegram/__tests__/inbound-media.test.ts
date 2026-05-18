import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTelegramInboundAttachments, resolveTelegramInboundAugmentation } from '../inbound-media.js'

describe('telegram inbound media augmentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses attachment refs from inbound message_data', () => {
    const attachments = getTelegramInboundAttachments({
      attachments: [
        { kind: 'image', file_id: 'photo-1', width: 512, height: 512 },
        { kind: 'voice', file_id: 'voice-1', duration: 6, mime_type: 'audio/ogg' },
      ],
    })

    expect(attachments).toEqual([
      expect.objectContaining({ kind: 'image', file_id: 'photo-1' }),
      expect.objectContaining({ kind: 'voice', file_id: 'voice-1', duration: 6 }),
    ])
  })

  it('downloads images and appends spoken context into effective text', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=photo-1')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/file_1.jpg' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/getFile?file_id=voice-1')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file_1.ogg' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/file/botbot-token/photos/file_1.jpg')) {
        return new Response(Buffer.from('image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      }
      if (url.includes('/file/botbot-token/voice/file_1.ogg')) {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ text: 'Price broke resistance.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await resolveTelegramInboundAugmentation({
      messageText: 'Please review',
      messageData: {
        attachments: [
          { kind: 'image', file_id: 'photo-1' },
          { kind: 'voice', file_id: 'voice-1', mime_type: 'audio/ogg' },
        ],
      },
      botToken: 'bot-token',
      llmBaseUrl: 'https://api.example.com/v1',
      llmApiKey: 'sk-test',
    })

    expect(result.images).toEqual([
      expect.objectContaining({
        mimeType: 'image/jpeg',
        data: Buffer.from('image-bytes').toString('base64'),
      }),
    ])
    expect(result.effectiveText).toContain('Please review')
    expect(result.effectiveText).toContain('Additional spoken context:')
    expect(result.effectiveText).toContain('Price broke resistance.')
  })

  it('normalizes explicit Telegram .oga filenames before worker-side transcription', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-oga')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file_1.oga' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/file/botbot-token/voice/file_1.oga')) {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        const form = init?.body as FormData
        const file = form.get('file')
        expect(file).toBeInstanceOf(File)
        expect((file as File).name).toBe('telegram-worker.ogg')
        return new Response(JSON.stringify({ text: 'Worker transcript.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock as typeof fetch)

    const result = await resolveTelegramInboundAugmentation({
      messageText: 'Please review',
      messageData: {
        attachments: [
          { kind: 'voice', file_id: 'voice-oga', file_name: 'telegram-worker.oga', mime_type: 'audio/ogg' },
        ],
      },
      botToken: 'bot-token',
      llmBaseUrl: 'https://api.example.com/v1',
      llmApiKey: 'sk-test',
    })

    expect(result.effectiveText).toBe('Please review\n\nAdditional spoken context:\nWorker transcript.')
  })
})
