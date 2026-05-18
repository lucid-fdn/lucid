import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyEvent, isDurableEventType } from '../event-classifier'

describe('classifyEvent', () => {
  describe('durable by type', () => {
    it('always persists error events', () => {
      const result = classifyEvent('error', 'info')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_type')
    })

    it('always persists message_sent events', () => {
      const result = classifyEvent('message_sent', 'info')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_type')
    })

    it('always persists native_mutation_candidate events', () => {
      const result = classifyEvent('native_mutation_candidate', 'info')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_type')
    })

    it('persists error events even with info severity', () => {
      const result = classifyEvent('error')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_type')
    })
  })

  describe('durable by severity', () => {
    it('always persists warning severity events', () => {
      const result = classifyEvent('tool_call', 'warning')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_severity')
    })

    it('always persists error severity events', () => {
      const result = classifyEvent('run_started', 'error')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_severity')
    })

    it('always persists critical severity events', () => {
      const result = classifyEvent('tool_result', 'critical')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_severity')
    })
  })

  describe('durable type takes priority over severity check', () => {
    it('error event with warning severity returns durable_type not durable_severity', () => {
      const result = classifyEvent('error', 'warning')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('durable_type')
    })
  })

  describe('noisy events — sampling', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random')
    })

    afterEach(() => {
      mathRandomSpy.mockRestore()
    })

    it('persists noisy event when sampled in (random < 0.1)', () => {
      mathRandomSpy.mockReturnValue(0.05)
      const result = classifyEvent('tool_call', 'info')
      expect(result.shouldPersist).toBe(true)
      expect(result.reason).toBe('sampled_in')
    })

    it('drops noisy event when sampled out (random >= 0.1)', () => {
      mathRandomSpy.mockReturnValue(0.5)
      const result = classifyEvent('tool_call', 'info')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
    })

    it('drops tool_result at boundary (random = 0.1)', () => {
      mathRandomSpy.mockReturnValue(0.1)
      const result = classifyEvent('tool_result', 'info')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
    })

    it('drops message_received when sampled out', () => {
      mathRandomSpy.mockReturnValue(0.9)
      const result = classifyEvent('message_received', 'info')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
    })

    it('drops run_started when sampled out', () => {
      mathRandomSpy.mockReturnValue(0.3)
      const result = classifyEvent('run_started', 'info')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
    })

    it('drops run_finished when sampled out', () => {
      mathRandomSpy.mockReturnValue(0.8)
      const result = classifyEvent('run_finished', 'info')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
    })

    it('samples noisy events at approximately 10% rate', () => {
      const iterations = 10000
      let persisted = 0

      mathRandomSpy.mockRestore()

      for (let i = 0; i < iterations; i++) {
        const result = classifyEvent('tool_call', 'info')
        if (result.shouldPersist) persisted++
      }

      const rate = persisted / iterations
      // Allow generous tolerance: 5-15%
      expect(rate).toBeGreaterThan(0.05)
      expect(rate).toBeLessThan(0.15)
    })
  })

  describe('default severity', () => {
    it('defaults to info severity when not provided', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const result = classifyEvent('tool_call')
      expect(result.shouldPersist).toBe(false)
      expect(result.reason).toBe('sampled_out')
      mathRandomSpy.mockRestore()
    })
  })
})

describe('isDurableEventType', () => {
  it('returns true for error', () => {
    expect(isDurableEventType('error')).toBe(true)
  })

  it('returns true for message_sent', () => {
    expect(isDurableEventType('message_sent')).toBe(true)
  })

  it('returns true for native_mutation_candidate', () => {
    expect(isDurableEventType('native_mutation_candidate')).toBe(true)
  })

  it('returns false for tool_call', () => {
    expect(isDurableEventType('tool_call')).toBe(false)
  })

  it('returns false for run_started', () => {
    expect(isDurableEventType('run_started')).toBe(false)
  })

  it('returns false for unknown event types', () => {
    expect(isDurableEventType('something_random')).toBe(false)
  })
})
