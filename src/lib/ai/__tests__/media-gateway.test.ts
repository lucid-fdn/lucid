import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const buildAudioTranscriptionCandidates = vi.fn()
const transcribeAudioWithCandidates = vi.fn()
const transcribeAudioWithCandidatesDetailed = vi.fn()
const synthesizeAudioSpeech = vi.fn()

vi.mock('@/lib/media/audio-transcription', () => ({
  buildAudioTranscriptionCandidates: (...args: unknown[]) => buildAudioTranscriptionCandidates(...args),
  transcribeAudioWithCandidates: (...args: unknown[]) => transcribeAudioWithCandidates(...args),
  transcribeAudioWithCandidatesDetailed: (...args: unknown[]) => transcribeAudioWithCandidatesDetailed(...args),
}))

vi.mock('@/lib/media/audio-speech', () => ({
  synthesizeAudioSpeech: (...args: unknown[]) => synthesizeAudioSpeech(...args),
}))

import { synthesizeSpeech, transcribeAudio, transcribeAudioDetailed } from '../media-gateway'

describe('media gateway', () => {
  it('builds transcription candidates when callers do not provide them', async () => {
    buildAudioTranscriptionCandidates.mockReturnValueOnce([{ provider: 'trustgate' }])
    transcribeAudioWithCandidates.mockResolvedValueOnce('Transcript')

    await expect(transcribeAudio({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['secret'],
    })).resolves.toBe('Transcript')

    expect(buildAudioTranscriptionCandidates).toHaveBeenCalledWith({
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['secret'],
    })
    expect(transcribeAudioWithCandidates).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'voice.ogg',
      candidates: [{ provider: 'trustgate' }],
    }))
  })

  it('delegates speech generation to the shared speech helper', async () => {
    synthesizeAudioSpeech.mockResolvedValueOnce({
      buffer: Buffer.from('voice'),
      mimeType: 'audio/ogg',
      fileName: 'telegram-voice.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
    })

    await expect(synthesizeSpeech({
      text: 'Hello',
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

  it('returns detailed transcription metadata without changing candidate order', async () => {
    buildAudioTranscriptionCandidates.mockReturnValueOnce([{ provider: 'trustgate' }])
    transcribeAudioWithCandidatesDetailed.mockResolvedValueOnce({
      text: 'Transcript',
      provider: 'trustgate',
      model: 'gpt-4o-mini-transcribe',
      inputBytes: 5,
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      latencyMs: 77,
    })

    await expect(transcribeAudioDetailed({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      gatewayBaseUrls: ['https://trustgate-api-production.up.railway.app'],
      gatewayApiKeys: ['secret'],
    })).resolves.toMatchObject({
      text: 'Transcript',
      provider: 'trustgate',
      model: 'gpt-4o-mini-transcribe',
      inputBytes: 5,
    })

    expect(transcribeAudioWithCandidatesDetailed).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'voice.ogg',
      candidates: [{ provider: 'trustgate' }],
    }))
  })
})
