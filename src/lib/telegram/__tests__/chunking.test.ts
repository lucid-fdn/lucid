import { describe, it, expect } from 'vitest'
import { splitTelegramMessage, TELEGRAM_TEXT_CHUNK_LIMIT } from '../chunking'

describe('splitTelegramMessage', () => {
  it('returns [] for empty input', () => {
    expect(splitTelegramMessage('')).toEqual([])
  })

  it('returns single chunk when under the limit', () => {
    expect(splitTelegramMessage('hello')).toEqual(['hello'])
  })

  it('returns single chunk at exactly the limit', () => {
    const text = 'a'.repeat(TELEGRAM_TEXT_CHUNK_LIMIT)
    expect(splitTelegramMessage(text)).toEqual([text])
  })

  it('splits on paragraph break (double newline)', () => {
    const first = 'a'.repeat(3000)
    const second = 'b'.repeat(3000)
    const chunks = splitTelegramMessage(`${first}\n\n${second}`, 4000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(first)
    expect(chunks[1]).toBe(second)
  })

  it('splits on single newline when no paragraph break', () => {
    const first = 'a'.repeat(3000)
    const second = 'b'.repeat(3000)
    const chunks = splitTelegramMessage(`${first}\n${second}`, 4000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(first)
    expect(chunks[1]).toBe(second)
  })

  it('splits on sentence boundary when no newlines', () => {
    const first = 'a'.repeat(3500) + '.'
    const second = 'b'.repeat(3000)
    const chunks = splitTelegramMessage(`${first} ${second}`, 4000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(first)
    expect(chunks[1]).toBe(second)
  })

  it('splits on space as last resort', () => {
    const first = 'a'.repeat(3500)
    const second = 'b'.repeat(3000)
    const chunks = splitTelegramMessage(`${first} ${second}`, 4000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(first)
    expect(chunks[1]).toBe(second)
  })

  it('hard-splits when no break available', () => {
    const text = 'a'.repeat(9000)
    const chunks = splitTelegramMessage(text, 4000)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.every((c) => c.length <= 4000)).toBe(true)
    expect(chunks.join('')).toBe(text)
  })

  it('splits very long text into multiple chunks', () => {
    const parts = Array.from({ length: 5 }, (_, i) =>
      `Paragraph ${i}: ${'x'.repeat(2500)}`,
    )
    const text = parts.join('\n\n')
    const chunks = splitTelegramMessage(text, 4000)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.every((c) => c.length > 0 && c.length <= 4000)).toBe(true)
  })

  it('drops empty chunks (never emits "")', () => {
    const chunks = splitTelegramMessage('\n\n\n\n', 10)
    expect(chunks.every((c) => c.length > 0)).toBe(true)
  })

  it('preserves order of content', () => {
    const text = 'alpha\n\nbeta\n\ngamma\n\ndelta'
    const chunks = splitTelegramMessage(text, 10)
    expect(chunks.join(' ')).toContain('alpha')
    expect(chunks.join(' ')).toContain('delta')
    // alpha must come before delta in the joined sequence
    const joined = chunks.join('|')
    expect(joined.indexOf('alpha')).toBeLessThan(joined.indexOf('delta'))
  })
})
