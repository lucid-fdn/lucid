import { describe, expect, it, vi } from 'vitest'

const transcribeAudioSingle = vi.fn()
const synthesizeAudioSpeech = vi.fn()

vi.mock('../../channels/bridge/media/audio-transcription.js', () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudioSingle(...args),
}))

vi.mock('../../channels/bridge/media/audio-speech.js', () => ({
  synthesizeAudioSpeech: (...args: unknown[]) => synthesizeAudioSpeech(...args),
}))

import { synthesizeSpeech, transcribeAudio } from '../media-gateway.js'

describe('worker media gateway', () => {
  it('delegates transcription to the worker media helper', async () => {
    transcribeAudioSingle.mockResolvedValueOnce('Transcript')

    await expect(transcribeAudio({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      gatewayEndpoints: [{ baseUrl: 'https://api.example.com/v1', apiKey: 'secret' }],
      gatewayBaseUrls: ['https://api.example.com/v1'],
      gatewayApiKeys: ['secret'],
    })).resolves.toBe('Transcript')

    expect(transcribeAudioSingle).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'voice.ogg',
      gatewayEndpoints: [{ baseUrl: 'https://api.example.com/v1', apiKey: 'secret' }],
      gatewayBaseUrls: ['https://api.example.com/v1'],
      gatewayApiKeys: ['secret'],
    }))
  })

  it('delegates speech generation to the worker speech helper', async () => {
    synthesizeAudioSpeech.mockResolvedValueOnce({
      buffer: Buffer.from('voice'),
      mimeType: 'audio/ogg',
      fileName: 'telegram-voice.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
    })

    await expect(synthesizeSpeech({
      text: 'Hello',
      gatewayEndpoints: [{ baseUrl: 'https://trustgate-api-production.up.railway.app', apiKey: 'secret' }],
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['secret'],
      fileBaseName: 'telegram-voice',
    })).resolves.toMatchObject({
      fileName: 'telegram-voice.ogg',
      provider: 'trustgate',
    })

    expect(synthesizeAudioSpeech).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Hello',
      fileBaseName: 'telegram-voice',
    }))
  })
})
