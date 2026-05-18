import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRuntimeImageConfigurationError,
  isRuntimeImageConfigured,
  resolveRuntimeImage,
  resolveRuntimeLaunchImage,
} from './image-resolution'

describe('image resolution', () => {
  const originalHermesImage = process.env.LUCID_HERMES_IMAGE
  const originalHermesC1Image = process.env.LUCID_HERMES_C1_MANAGED_IMAGE
  const originalWorkerImage = process.env.LUCID_WORKER_IMAGE

  afterEach(() => {
    if (originalHermesImage === undefined) {
      delete process.env.LUCID_HERMES_IMAGE
    } else {
      process.env.LUCID_HERMES_IMAGE = originalHermesImage
    }

    if (originalHermesC1Image === undefined) {
      delete process.env.LUCID_HERMES_C1_MANAGED_IMAGE
    } else {
      process.env.LUCID_HERMES_C1_MANAGED_IMAGE = originalHermesC1Image
    }

    if (originalWorkerImage === undefined) {
      delete process.env.LUCID_WORKER_IMAGE
    } else {
      process.env.LUCID_WORKER_IMAGE = originalWorkerImage
    }

    vi.restoreAllMocks()
  })

  it('reports missing Hermes image configuration for managed runtimes', () => {
    delete process.env.LUCID_HERMES_IMAGE
    delete process.env.LUCID_HERMES_C1_MANAGED_IMAGE
    process.env.LUCID_WORKER_IMAGE = 'ghcr.io/example/generic-worker:latest'

    expect(getRuntimeImageConfigurationError('hermes', 'c1_managed')).toBe(
      'No Hermes runtime image configured for c1_managed. Set LUCID_HERMES_C1_MANAGED_IMAGE or LUCID_HERMES_IMAGE.',
    )
    expect(isRuntimeImageConfigured('hermes', 'c1_managed')).toBe(false)
    expect(() => resolveRuntimeImage('hermes', 'c1_managed')).toThrow(
      'No Hermes runtime image configured for c1_managed. Set LUCID_HERMES_C1_MANAGED_IMAGE or LUCID_HERMES_IMAGE.',
    )
  })

  it('accepts Hermes fallback image configuration', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/example/hermes:latest'

    expect(getRuntimeImageConfigurationError('hermes', 'c1_managed')).toBeNull()
    expect(isRuntimeImageConfigured('hermes', 'c1_managed')).toBe(true)
    expect(resolveRuntimeImage('hermes', 'c1_managed')).toBe('ghcr.io/example/hermes:latest')
  })

  it('rejects hermes-agent images for dedicated Hermes runtimes', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/nousresearch/hermes-agent:latest'

    expect(getRuntimeImageConfigurationError('hermes', 'c1_managed')).toBe(
      'Hermes runtime image "ghcr.io/nousresearch/hermes-agent:latest" is not compatible with c1_managed. Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, for example ghcr.io/daishizensensei/worker:latest.',
    )
    expect(isRuntimeImageConfigured('hermes', 'c1_managed')).toBe(false)
    expect(() => resolveRuntimeImage('hermes', 'c1_managed')).toThrow(
      'Hermes runtime image "ghcr.io/nousresearch/hermes-agent:latest" is not compatible with c1_managed. Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, for example ghcr.io/daishizensensei/worker:latest.',
    )
  })

  it('rejects deprecated Hermes bootstrap worker tags for managed runtimes', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/daishizensensei/worker:hermes-fix-20260415-5'

    expect(getRuntimeImageConfigurationError('hermes', 'c1_managed')).toBe(
      'Hermes runtime image "ghcr.io/daishizensensei/worker:hermes-fix-20260415-5" is not compatible with c1_managed. Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, for example ghcr.io/daishizensensei/worker:latest.',
    )
    expect(isRuntimeImageConfigured('hermes', 'c1_managed')).toBe(false)
    expect(() => resolveRuntimeImage('hermes', 'c1_managed')).toThrow(
      'Hermes runtime image "ghcr.io/daishizensensei/worker:hermes-fix-20260415-5" is not compatible with c1_managed. Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, for example ghcr.io/daishizensensei/worker:latest.',
    )
  })

  it('falls back to the canonical worker image for managed Hermes launch when env config is stale', () => {
    process.env.LUCID_HERMES_IMAGE = 'ghcr.io/daishizensensei/worker:hermes-fix-20260415-5'

    expect(resolveRuntimeLaunchImage('hermes', 'c1_managed')).toBe('ghcr.io/daishizensensei/worker:latest')
  })

  it('still rejects deprecated explicit Hermes launch overrides', () => {
    expect(() =>
      resolveRuntimeLaunchImage('hermes', 'c1_managed', 'ghcr.io/daishizensensei/worker:hermes-fix-20260415-5'),
    ).toThrow(
      'Hermes runtime image "ghcr.io/daishizensensei/worker:hermes-fix-20260415-5" is not compatible with c1_managed. Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, for example ghcr.io/daishizensensei/worker:latest.',
    )
  })

  it('always resolves OpenClaw to a default image', () => {
    expect(getRuntimeImageConfigurationError('openclaw', 'c1_managed')).toBeNull()
    expect(isRuntimeImageConfigured('openclaw', 'c1_managed')).toBe(true)
    expect(resolveRuntimeImage('openclaw', 'c1_managed')).toContain('worker:latest')
  })
})
