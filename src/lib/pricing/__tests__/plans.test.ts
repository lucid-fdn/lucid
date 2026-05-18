import { describe, expect, it } from 'vitest'

import { applyLaunchPlanPresentation } from '../plans'

describe('launch plan presentation', () => {
  it('maps canonical and legacy plan names without throwing', () => {
    expect(applyLaunchPlanPresentation({ name: 'starter' }).display_name).toBe('Starter')
    expect(applyLaunchPlanPresentation({ name: 'free' }).display_name).toBe('Starter')
    expect(applyLaunchPlanPresentation({ name: 'enterprise' }).display_name).toBe('Scale')
  })

  it('leaves unknown plan names intact instead of breaking public pricing', () => {
    expect(applyLaunchPlanPresentation({
      name: 'custom',
      display_name: 'Custom',
      price_monthly_usd: 123,
    })).toEqual({
      name: 'custom',
      display_name: 'Custom',
      price_monthly_usd: 123,
    })
  })
})
