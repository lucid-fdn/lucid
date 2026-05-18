import { describe, it, expect } from 'vitest'
import { sentimentLabel, satisfactionPercent, calcAbandonmentRate } from '../conversation-intelligence'
import type { ConversationScore } from '../conversation-intelligence'

describe('sentimentLabel', () => {
  it('returns positive for score > 0.3', () => {
    expect(sentimentLabel(0.8)).toBe('positive')
    expect(sentimentLabel(0.31)).toBe('positive')
  })

  it('returns negative for score < -0.3', () => {
    expect(sentimentLabel(-0.5)).toBe('negative')
    expect(sentimentLabel(-0.31)).toBe('negative')
  })

  it('returns neutral for score between -0.3 and 0.3', () => {
    expect(sentimentLabel(0)).toBe('neutral')
    expect(sentimentLabel(0.3)).toBe('neutral')
    expect(sentimentLabel(-0.3)).toBe('neutral')
    expect(sentimentLabel(0.1)).toBe('neutral')
  })
})

describe('satisfactionPercent', () => {
  it('formats score as percentage', () => {
    expect(satisfactionPercent(0.85)).toBe('85%')
    expect(satisfactionPercent(1)).toBe('100%')
    expect(satisfactionPercent(0)).toBe('0%')
  })

  it('clamps values outside 0-1', () => {
    expect(satisfactionPercent(1.5)).toBe('100%')
    expect(satisfactionPercent(-0.5)).toBe('0%')
  })
})

describe('calcAbandonmentRate', () => {
  it('returns 0 for empty array', () => {
    expect(calcAbandonmentRate([])).toBe(0)
  })

  it('returns correct rate for mix of abandoned/not', () => {
    const scores: ConversationScore[] = [
      { conversation_id: '1', satisfaction: 0.9, re_ask_count: 0, abandonment: false, turn_count: 5 },
      { conversation_id: '2', satisfaction: 0.2, re_ask_count: 3, abandonment: true, turn_count: 2 },
      { conversation_id: '3', satisfaction: 0.5, re_ask_count: 1, abandonment: false, turn_count: 4 },
      { conversation_id: '4', satisfaction: 0.1, re_ask_count: 2, abandonment: true, turn_count: 1 },
    ]
    // 2 out of 4 abandoned
    expect(calcAbandonmentRate(scores)).toBe(0.5)
  })

  it('returns 1 when all abandoned', () => {
    const scores: ConversationScore[] = [
      { conversation_id: '1', satisfaction: 0, re_ask_count: 0, abandonment: true, turn_count: 1 },
      { conversation_id: '2', satisfaction: 0, re_ask_count: 0, abandonment: true, turn_count: 1 },
    ]
    expect(calcAbandonmentRate(scores)).toBe(1)
  })

  it('returns 0 when none abandoned', () => {
    const scores: ConversationScore[] = [
      { conversation_id: '1', satisfaction: 0.9, re_ask_count: 0, abandonment: false, turn_count: 5 },
    ]
    expect(calcAbandonmentRate(scores)).toBe(0)
  })
})
