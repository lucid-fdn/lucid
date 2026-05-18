import { describe, expect, it } from 'vitest'
import {
  assertGenerationStatusTransition,
  canTransitionGenerationStatus,
  isTerminalGenerationStatus,
} from '../state-machine'
import { AppServiceError } from '../errors'

describe('App Service generation state machine', () => {
  it('allows expected forward transitions', () => {
    expect(canTransitionGenerationStatus('queued', 'planning')).toBe(true)
    expect(canTransitionGenerationStatus('planning', 'generating')).toBe(true)
    expect(canTransitionGenerationStatus('generating', 'building')).toBe(true)
    expect(canTransitionGenerationStatus('building', 'evaluating')).toBe(true)
    expect(canTransitionGenerationStatus('evaluating', 'succeeded')).toBe(true)
  })

  it('blocks terminal and backwards transitions', () => {
    expect(canTransitionGenerationStatus('succeeded', 'planning')).toBe(false)
    expect(canTransitionGenerationStatus('building', 'planning')).toBe(false)
    expect(() => assertGenerationStatusTransition('succeeded', 'planning')).toThrow(AppServiceError)
  })

  it('identifies terminal statuses', () => {
    expect(isTerminalGenerationStatus('succeeded')).toBe(true)
    expect(isTerminalGenerationStatus('failed')).toBe(true)
    expect(isTerminalGenerationStatus('cancelled')).toBe(true)
    expect(isTerminalGenerationStatus('deploying')).toBe(false)
  })
})
