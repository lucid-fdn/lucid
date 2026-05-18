import { describe, expect, it } from 'vitest'
import { chunkChannelText, chunkText } from '../channel-text-chunks'

describe('channel text chunks', () => {
  it('splits Discord text without dropping later findings', () => {
    const lines = Array.from({ length: 80 }, (_, index) =>
      `Finding ${index + 1}: wallet activity evidence item ${index + 1}`,
    )
    const text = ['Web3 template simulation', ...lines, 'TAIL_MARKER_KEEP_ME'].join('\n')

    const chunks = chunkChannelText(text, 'discord')

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 1900)).toBe(true)
    expect(chunks.at(-1)).toContain('TAIL_MARKER_KEEP_ME')
    expect(chunks.join('\n')).toContain('Finding 80')
  })

  it('splits long single lines instead of truncating them', () => {
    const text = `prefix ${'x'.repeat(1200)} UNIQUE_TAIL`
    const chunks = chunkText(text, { maxChars: 300 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true)
    expect(chunks.join('')).toContain('UNIQUE_TAIL')
  })
})
