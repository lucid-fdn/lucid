import { describe, expect, it } from 'vitest'

import {
  applyAudioLanguageGuardrail,
  inferConversationScript,
} from '../audio-language-guardrail.js'

describe('audio language guardrail', () => {
  it('detects latin-script conversation history', () => {
    expect(
      inferConversationScript([
        { role: 'user', content: 'Can you help me with my Discord setup?' },
        { role: 'assistant', content: 'Yes, I can help with that.' },
      ]),
    ).toBe('latin')
  })

  it('detects cyrillic-script conversation history', () => {
    expect(
      inferConversationScript([
        { role: 'user', content: 'Ты можешь помочь мне?' },
        { role: 'assistant', content: 'Да, конечно.' },
      ]),
    ).toBe('cyrillic')
  })

  it('adds a latin-script guardrail for audio turns', () => {
    expect(
      applyAudioLanguageGuardrail({
        userMessage: 'Ты уверен?',
        recentMessages: [
          { role: 'user', content: 'Are you sure this is live?' },
          { role: 'assistant', content: 'Yes, it is live now.' },
        ],
        messageData: { discord_audio_input: true },
      }),
    ).toContain('do not switch to Russian/Cyrillic')
  })

  it('leaves non-audio turns unchanged', () => {
    expect(
      applyAudioLanguageGuardrail({
        userMessage: 'Plain text question',
        recentMessages: [{ role: 'user', content: 'Earlier plain text' }],
        messageData: {},
      }),
    ).toBe('Plain text question')
  })
})
