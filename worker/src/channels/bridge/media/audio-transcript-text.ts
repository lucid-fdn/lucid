export interface NormalizeAudioTranscriptInput {
  messageText: string
  transcript?: string | null
  unavailableNote?: string | null
  failureNote?: string | null
}

/**
 * Normalize successful audio transcription into the effective user text.
 *
 * Rules:
 * - audio-only + transcript => transcript becomes the user message
 * - typed text + transcript => typed text stays primary, transcript becomes
 *   secondary spoken context
 * - no transcript => preserve text and optional fallback notes
 */
export function normalizeAudioTranscriptText(
  params: NormalizeAudioTranscriptInput,
): { effectiveText: string } {
  const messageText = params.messageText.trim()
  const transcript = params.transcript?.trim()
  const unavailableNote = params.unavailableNote?.trim()
  const failureNote = params.failureNote?.trim()

  if (transcript) {
    if (!messageText) {
      return { effectiveText: transcript }
    }

    return {
      effectiveText: [messageText, `Additional spoken context:\n${transcript}`]
        .filter(Boolean)
        .join('\n\n')
        .trim(),
    }
  }

  return {
    effectiveText: [messageText, unavailableNote, failureNote]
      .filter(Boolean)
      .join('\n\n')
      .trim(),
  }
}
