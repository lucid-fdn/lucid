import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildAudioSpeechCandidates,
  buildAudioSpeechFileName,
  resolveAudioSpeechFormat,
  synthesizeAudioSpeech,
} from '../audio-speech'

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
})

describe('audio speech helpers', () => {
  it('defaults speech output to opus/ogg', () => {
    expect(resolveAudioSpeechFormat(undefined)).toBe('opus')
    expect(buildAudioSpeechFileName('opus', 'telegram-reply')).toBe('telegram-reply.ogg')
  })

  it('prefers TrustGate first when TTS_PROVIDER is auto', () => {
    process.env.OPENAI_API_KEY = 'openai-secret'
    const candidates = buildAudioSpeechCandidates({
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['trustgate-secret'],
    })

    expect(candidates[0]).toMatchObject({
      provider: 'trustgate',
      baseUrl: 'https://trustgate-api-production.up.railway.app',
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
