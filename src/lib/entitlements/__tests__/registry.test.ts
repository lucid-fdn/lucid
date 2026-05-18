import { describe, it, expect } from 'vitest'
import { getEntitlementDisplay, ENTITLEMENT_DISPLAY } from '../registry'

describe('getEntitlementDisplay', () => {
  it('returns registered metadata for known metrics', () => {
    const result = getEntitlementDisplay('ai_queries_monthly')
    expect(result).toEqual({
      icon: 'MessageSquare',
      label: 'AI Queries',
      contextHint: 'chat',
    })
  })

  it('returns display metadata for storage_gb', () => {
    const result = getEntitlementDisplay('storage_gb')
    expect(result.label).toBe('Storage')
    expect(result.contextHint).toBe('inline')
  })

  it('returns display metadata for max_members', () => {
    const result = getEntitlementDisplay('max_members')
    expect(result.label).toBe('Team Members')
    expect(result.contextHint).toBe('modal')
  })

  it('returns sensible defaults for unknown metrics', () => {
    const result = getEntitlementDisplay('some_unknown_metric')
    expect(result.icon).toBe('AlertCircle')
    expect(result.label).toBe('Some Unknown Metric')
    expect(result.contextHint).toBe('toast')
  })

  it('converts underscored metric names to Title Case for defaults', () => {
    const result = getEntitlementDisplay('max_foo_bar_baz')
    expect(result.label).toBe('Max Foo Bar Baz')
  })

  it('has entries for all documented metric types', () => {
    const expectedMetrics = [
      'ai_queries_monthly',
      'api_calls_monthly',
      'storage_gb',
      'max_members',
      'max_projects',
      'max_workspaces',
      'max_plugins_per_assistant',
      'max_plugin_tools_total',
      'max_gateway_keys',
      'plugins_enabled',
      'video_enabled',
      'sso_enabled',
      'api_access',
      'webhooks',
    ]

    for (const metric of expectedMetrics) {
      expect(ENTITLEMENT_DISPLAY[metric]).toBeDefined()
    }
  })
})
