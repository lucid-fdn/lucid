import { describe, it, expect } from 'vitest'
import { OperationalError } from '@/components/shared/operational-error'

/**
 * Tests for OperationalError component.
 * Vitest env is 'node' (no DOM/React runtime), so we verify module contract
 * and export shape — not rendered output.
 */

describe('OperationalError', () => {
  it('is exported as a function component', () => {
    expect(typeof OperationalError).toBe('function')
    expect(OperationalError.name).toBe('OperationalError')
  })

  it('accepts the required 3-layer props via function signature', () => {
    // Function.length reflects required params (1 = single props object)
    expect(OperationalError.length).toBe(1)
  })
})
