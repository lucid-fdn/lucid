import { afterEach, describe, expect, it } from 'vitest'
import { getEngineDeployReadiness } from './deploy-readiness'

describe('engine deploy readiness', () => {
  const originalL2ApiUrl = process.env.LUCID_L2_API_URL
  const originalL2Available = process.env.NEXT_PUBLIC_L2_AVAILABLE
  const originalHermesImage = process.env.LUCID_HERMES_IMAGE

  afterEach(() => {
    if (originalL2ApiUrl === undefined) delete process.env.LUCID_L2_API_URL
    else process.env.LUCID_L2_API_URL = originalL2ApiUrl

    if (originalL2Available === undefined) delete process.env.NEXT_PUBLIC_L2_AVAILABLE
    else process.env.NEXT_PUBLIC_L2_AVAILABLE = originalL2Available

    if (originalHermesImage === undefined) delete process.env.LUCID_HERMES_IMAGE
    else process.env.LUCID_HERMES_IMAGE = originalHermesImage
  })

  it('marks Hermes dedicated deploy blocked when image is missing', () => {
    delete process.env.LUCID_HERMES_IMAGE
    process.env.LUCID_L2_API_URL = 'https://l2.example.com/api'

    const readiness = getEngineDeployReadiness({
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      provider: 'railway',
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.blockerLabel).toBe('Not configured')
  })

  it('marks Hermes dedicated deploy blocked when L2 is unavailable', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/example/hermes:latest'
    delete process.env.LUCID_L2_API_URL
    delete process.env.NEXT_PUBLIC_L2_AVAILABLE

    const readiness = getEngineDeployReadiness({
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      provider: 'railway',
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.blockerLabel).toBe('L2 unavailable')
  })

  it('treats Hermes manual BYO as ready without L2', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/example/hermes:latest'
    delete process.env.LUCID_L2_API_URL

    const readiness = getEngineDeployReadiness({
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
      provider: 'manual',
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.note).toBe('Experimental • Relay only')
  })
})
