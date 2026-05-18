import { describe, expect, it } from 'vitest'

import { normalizeAudioTranscriptText } from '../audio-transcript-text.js'

describe('audio transcript text normalization', () => {
  it('uses transcript as the effective user text for audio-only turns', () => {
    expect(
      normalizeAudioTranscriptText({
        messageText: '',
        transcript: 'Are you sure?',
      }).effectiveText,
    ).toBe('Are you sure?')
  })

  it('keeps typed text primary and appends spoken context when both exist', () => {
    expect(
      normalizeAudioTranscriptText({
        messageText: 'Please review this.',
        transcript: 'Price broke resistance.',
      }).effectiveText,
    ).toBe('Please review this.\n\nAdditional spoken context:\nPrice broke resistance.')
  })

  it('returns fallback notes when transcription is unavailable', () => {
    expect(
      normalizeAudioTranscriptText({
        messageText: '',
        unavailableNote: 'User sent audio, but transcription was unavailable.',
      }).effectiveText,
    ).toBe('User sent audio, but transcription was unavailable.')
  })
})
