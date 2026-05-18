import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildAudioSpeechCandidates,
  buildAudioSpeechFileName,
  resolveAudioSpeechFormat,
  synthesizeAudioSpeech,
} from '../audio-speech.js'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.TTS_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_BASE_URL
  delete process.env.OPENAI_TTS_API_KEY
  delete process.env.OPENAI_TTS_BASE_URL
  delete process.env.OPENAI_TTS_MODEL
  delete process.env.OPENAI_TTS_VOICE
  delete process.env.OPENAI_TTS_INSTRUCTIONS
  delete process.env.AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED
  delete process.env.AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED
  delete process.env.AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED
})

describe('worker audio speech helpers', () => {
  it('defaults speech output to opus/ogg', () => {
    expect(resolveAudioSpeechFormat(undefined)).toBe('opus')
    expect(buildAudioSpeechFileName('opus', 'telegram-reply')).toBe('telegram-reply.ogg')
  })

  it('uses TrustGate only when TTS_PROVIDER is auto and direct OpenAI fallback is disabled', () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    const candidates = buildAudioSpeechCandidates({
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['trustgate-secret'],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      provider: 'trustgate',
      baseUrl: 'https://trustgate-api-production.up.railway.app',
    })
  })

  it('adds direct OpenAI in auto mode only when fallback is enabled', () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    process.env.AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED = 'true'
    const candidates = buildAudioSpeechCandidates({
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['trustgate-secret'],
    })

    expect(candidates[1]).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    })
  })

  it('synthesizes speech through the first available provider', async () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://trustgate-api-production.up.railway.app/v1/audio/speech') {
        expect(init?.method).toBe('POST')
        return new Response(Buffer.from('voice-bytes'), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeAudioSpeech({
      text: 'Hello from Lucid.',
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['trustgate-secret'],
      fileBaseName: 'telegram-voice',
    })

    expect(result).toMatchObject({
      provider: 'trustgate',
      mimeType: 'audio/ogg',
      fileName: 'telegram-voice.ogg',
      model: 'gpt-4o-mini-tts',
    })
    expect(result.buffer.equals(Buffer.from('voice-bytes'))).toBe(true)
  })
})
