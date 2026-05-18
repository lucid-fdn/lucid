import { describe, expect, it } from 'vitest'

import {
  describeWorkerRole,
  isChannelAdminHttpMode,
  isAutomationRole,
  isDagStepRole,
  isGatewayRole,
  isInteractiveRole,
  isMaintenanceRole,
  isProductionAllMode,
  isPulseRecoveryRole,
  isPulseSweepRole,
  isWorkerHttpMode,
  shouldRegisterBrowserGateway,
  shouldStartDiscordGateway,
  shouldStartSlackGateway,
} from '../worker-role.js'

describe('worker role helpers', () => {
  it('flags interactive and automation roles correctly', () => {
    expect(isInteractiveRole('interactive')).toBe(true)
    expect(isInteractiveRole('automation')).toBe(false)
    expect(isAutomationRole('automation')).toBe(true)
    expect(isAutomationRole('interactive')).toBe(false)
    expect(isGatewayRole('gateway')).toBe(true)
    expect(isGatewayRole('all')).toBe(true)
    expect(isMaintenanceRole('automation')).toBe(true)
    expect(isMaintenanceRole('interactive_gateway')).toBe(false)
    expect(isDagStepRole('automation')).toBe(true)
    expect(isDagStepRole('interactive_gateway')).toBe(false)
    expect(isPulseRecoveryRole('automation')).toBe(true)
    expect(isPulseSweepRole('automation')).toBe(true)
  })

  it('describes roles for startup logs', () => {
    expect(describeWorkerRole('interactive')).toContain('interactive')
    expect(describeWorkerRole('automation')).toContain('automation')
  })

  it('keeps production channel gateways separate from worker and browser loops', () => {
    expect(shouldStartDiscordGateway('channels', 'interactive_gateway')).toBe(true)
    expect(shouldStartSlackGateway('channels', 'interactive_gateway')).toBe(true)
    expect(isWorkerHttpMode('channels')).toBe(false)
    expect(shouldRegisterBrowserGateway('channels', 'interactive_gateway')).toBe(false)
  })

  it('keeps Browser Operator isolated to browser mode while preserving all-mode compatibility', () => {
    expect(shouldRegisterBrowserGateway('browser', 'gateway')).toBe(true)
    expect(shouldRegisterBrowserGateway('all', 'all')).toBe(true)
    expect(shouldRegisterBrowserGateway('all', 'interactive_gateway')).toBe(true)
    expect(shouldRegisterBrowserGateway('worker', 'interactive')).toBe(false)
  })

  it('exposes channel admin routes on channel and worker services', () => {
    expect(isChannelAdminHttpMode('channels')).toBe(true)
    expect(isChannelAdminHttpMode('worker')).toBe(true)
    expect(isChannelAdminHttpMode('browser')).toBe(false)
  })

  it('flags production all mode as an anti-pattern', () => {
    expect(isProductionAllMode('all', 'production')).toBe(true)
    expect(isProductionAllMode('all', 'development')).toBe(false)
    expect(isProductionAllMode('channels', 'production')).toBe(false)
  })
})
