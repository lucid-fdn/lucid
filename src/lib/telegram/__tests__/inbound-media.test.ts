import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  extractTelegramInboundContent,
  resolveTelegramIngress,
  resolveTelegramIngressMessage,
  TELEGRAM_AUDIO_PROCESSING_UNAVAILABLE_REPLY,
} from '../inbound-media'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.STT_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_BASE_URL
  delete process.env.GROQ_API_KEY
  delete process.env.GROQ_BASE_URL
  delete process.env.DEEPGRAM_API_KEY
  delete process.env.DEEPGRAM_BASE_URL
  delete process.env.MISTRAL_API_KEY
  delete process.env.MISTRAL_BASE_URL
})

describe('extractTelegramInboundContent', () => {
  it('uses caption text and captures the largest photo attachment', () => {
    const result = extractTelegramInboundContent({
      caption: 'Check this chart',
      photo: [
        { file_id: 'small', width: 90, height: 90 },
        { file_id: 'large', width: 1024, height: 768, file_size: 4096 },
      ],
    })

    expect(result.messageText).toBe('Check this chart')
    expect(result.attachments).toEqual([
      expect.objectContaining({
        kind: 'image',
        file_id: 'large',
        width: 1024,
        height: 768,
        file_size: 4096,
      }),
    ])
  })

  it('captures voice, document, and sticker metadata when there is no text', () => {
    const result = extractTelegramInboundContent({
      voice: { file_id: 'voice-1', duration: 7, mime_type: 'audio/ogg' },
      document: {
        file_id: 'doc-1',
        file_name: 'quarterly-report.pdf',
        mime_type: 'application/pdf',
      },
      sticker: {
        file_id: 'sticker-1',
        emoji: 'fire',
        width: 512,
        height: 512,
      },
    })

    expect(result.messageText).toBeNull()
    expect(result.attachments).toEqual([
      expect.objectContaining({ kind: 'voice', file_id: 'voice-1', duration: 7 }),
      expect.objectContaining({ kind: 'document', file_name: 'quarterly-report.pdf' }),
      expect.objectContaining({ kind: 'sticker', emoji: 'fire', mime_type: 'image/webp' }),
    ])
  })
})

describe('resolveTelegramIngressMessage', () => {
  it('transcribes Telegram voice notes into ingress text', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-1')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.oga' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.oga')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        expect(init?.method).toBe('POST')
        const form = init?.body as FormData
        const file = form.get('file')
        expect(file).toBeInstanceOf(File)
        expect((file as File).name).toBe('file.ogg')
        return new Response(JSON.stringify({ text: 'Book the meeting for tomorrow.' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-1', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrl: 'https://api.lucid.foundation',
      llmApiKey: 'secret',
    })).resolves.toBe('Voice note transcript:\nBook the meeting for tomorrow.')
  })

  it('normalizes explicit Telegram .oga filenames before transcription', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-explicit-oga')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.oga' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.oga')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        const form = init?.body as FormData
        const file = form.get('file')
        expect(file).toBeInstanceOf(File)
        expect((file as File).name).toBe('telegram-note.ogg')
        return new Response(JSON.stringify({ text: 'Explicit filename transcript.' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-explicit-oga', mime_type: 'audio/ogg', file_name: 'telegram-note.oga' }],
      botToken: 'token',
      llmBaseUrl: 'https://api.lucid.foundation',
      llmApiKey: 'secret',
    })).resolves.toBe('Voice note transcript:\nExplicit filename transcript.')
  })

  it('prefers a direct OpenAI-compatible provider before Lucid gateway fallbacks', async () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-direct')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.ogg')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url === 'https://api.openai.com/v1/audio/transcriptions') {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ text: 'Direct provider transcript.' }), { status: 200 })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-direct', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrl: 'https://api.lucid.foundation',
      llmApiKey: 'secret',
    })).resolves.toBe('Voice note transcript:\nDirect provider transcript.')
  })

  it('prefers TrustGate first when STT_PROVIDER is auto', async () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'

    const seenUrls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      seenUrls.push(url)
      if (url.includes('/getFile?file_id=voice-auto')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.ogg')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url === 'https://trustgate-api-production.up.railway.app/v1/audio/transcriptions') {
        return new Response(JSON.stringify({ text: 'TrustGate transcript.' }), { status: 200 })
      }
      if (url === 'https://api.openai.com/v1/audio/transcriptions') {
        return new Response(JSON.stringify({ text: 'OpenAI transcript.' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-auto', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      llmApiKeys: ['trustgate-secret'],
    })).resolves.toBe('Voice note transcript:\nTrustGate transcript.')

    expect(seenUrls).toContain('https://trustgate-api-production.up.railway.app/v1/audio/transcriptions')
    expect(seenUrls).not.toContain('https://api.openai.com/v1/audio/transcriptions')
  })

  it('honors STT_PROVIDER override and bypasses TrustGate', async () => {
    process.env.STT_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'openai-secret'
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'

    const seenUrls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      seenUrls.push(url)
      if (url.includes('/getFile?file_id=voice-override')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.ogg')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url === 'https://api.openai.com/v1/audio/transcriptions') {
        return new Response(JSON.stringify({ text: 'Override transcript.' }), { status: 200 })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-override', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      llmApiKeys: ['trustgate-secret'],
    })).resolves.toBe('Voice note transcript:\nOverride transcript.')

    expect(seenUrls).toContain('https://api.openai.com/v1/audio/transcriptions')
    expect(seenUrls).not.toContain('https://trustgate-api-production.up.railway.app/v1/audio/transcriptions')
  })

  it('adds a readable fallback when transcription is unavailable', async () => {
    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'audio', file_name: 'briefing.mp3' }],
    })).resolves.toBe('User attached an audio file: briefing.mp3.')
  })

  it('falls back to a deployment-level note when all transcription endpoints reject audio', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-404')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.ogg')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngressMessage({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-404', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrls: ['https://trustgate-api-production.up.railway.app\\n', 'https://api.lucid.foundation'],
      llmApiKeys: ['your-key-here', 'secret'],
    })).resolves.toBe('User sent a voice note. Transcription is unavailable in this deployment.')
  })

  it('flags voice-note processing as unavailable when audio cannot be processed in this deployment', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/getFile?file_id=voice-404')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), { status: 200 })
      }
      if (url.includes('/file/bottoken/voice/file.ogg')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTelegramIngress({
      messageText: null,
      attachments: [{ kind: 'voice', file_id: 'voice-404', mime_type: 'audio/ogg' }],
      botToken: 'token',
      llmBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      llmApiKeys: ['secret'],
    })).resolves.toEqual({
      messageText: 'User sent a voice note. Transcription is unavailable in this deployment.',
      audioProcessingUnavailable: true,
    })
    expect(TELEGRAM_AUDIO_PROCESSING_UNAVAILABLE_REPLY).toMatch(/I received your voice note/i)
  })
})
