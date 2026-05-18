import { describe, it, expect } from 'vitest'
import {
  CHANNEL_TYPES,
  CHANNEL_METADATA,
  HOSTED_CHANNEL_TYPES,
  getRequiredFields,
  validateChannelForm,
} from '../types'

describe('Teams channel type registration', () => {
  it('includes msteams in CHANNEL_TYPES', () => {
    expect(CHANNEL_TYPES).toContain('msteams')
  })

  it('has metadata for msteams', () => {
    const meta = CHANNEL_METADATA.msteams
    expect(meta).toBeDefined()
    expect(meta.name).toBe('Microsoft Teams')
    expect(meta.icon).toBe('MessageSquare')
    expect(meta.color).toBe('bg-[#6264A7]')
    expect(meta.supportsHosted).toBe(true)
    expect(meta.requiresWebhook).toBe(true)
    expect(meta.setupComplexity).toBe('complex')
  })

  it('includes msteams in HOSTED_CHANNEL_TYPES', () => {
    expect(HOSTED_CHANNEL_TYPES).toContain('msteams')
  })

  it('requires appId, appPassword, tenantId for BYOB mode', () => {
    const fields = getRequiredFields('msteams', 'byob')
    expect(fields).toEqual(['appId', 'appPassword', 'tenantId'])
  })

  it('requires no fields for hosted mode', () => {
    const fields = getRequiredFields('msteams', 'hosted')
    expect(fields).toEqual([])
  })
})

describe('Teams form validation', () => {
  it('validates missing required fields', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('validates valid UUID for appId', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
      appId: 'not-a-uuid',
      appPassword: 'secret',
      tenantId: 'common',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('App ID must be a valid UUID'))
  })

  it('accepts valid UUID for appId', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
      appId: '12345678-1234-1234-1234-123456789abc',
      appPassword: 'secret',
      tenantId: 'common',
    })
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts "common" as tenantId', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
      appId: '12345678-1234-1234-1234-123456789abc',
      appPassword: 'secret',
      tenantId: 'common',
    })
    expect(result.isValid).toBe(true)
  })

  it('accepts valid UUID as tenantId', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
      appId: '12345678-1234-1234-1234-123456789abc',
      appPassword: 'secret',
      tenantId: 'abcdef12-3456-7890-abcd-ef1234567890',
    })
    expect(result.isValid).toBe(true)
  })

  it('rejects invalid tenantId format', () => {
    const result = validateChannelForm({
      channelType: 'msteams',
      connectionMode: 'byob',
      appId: '12345678-1234-1234-1234-123456789abc',
      appPassword: 'secret',
      tenantId: 'invalid-tenant',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Tenant ID'))
  })
})
