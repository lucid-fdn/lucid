import { describe, expect, it } from 'vitest'
import {
  canAccessAppServiceOrg,
  canControlAppServiceGenerationRun,
  canReadAppServiceOrg,
  canWriteAppServiceOrg,
} from '../operator-auth-core'

describe('app service operator auth core', () => {
  it('allows every org member to read but only admins and owners to write', () => {
    expect(canReadAppServiceOrg('owner')).toBe(true)
    expect(canReadAppServiceOrg('admin')).toBe(true)
    expect(canReadAppServiceOrg('member')).toBe(true)
    expect(canReadAppServiceOrg(null)).toBe(false)

    expect(canWriteAppServiceOrg('owner')).toBe(true)
    expect(canWriteAppServiceOrg('admin')).toBe(true)
    expect(canWriteAppServiceOrg('member')).toBe(false)
    expect(canWriteAppServiceOrg(null)).toBe(false)

    expect(canAccessAppServiceOrg('member', 'read')).toBe(true)
    expect(canAccessAppServiceOrg('member', 'write')).toBe(false)
  })

  it('allows generation run control only for the creator, admin, or owner', () => {
    expect(canControlAppServiceGenerationRun({
      userId: 'user-1',
      createdBy: 'user-1',
      role: 'member',
    })).toBe(true)
    expect(canControlAppServiceGenerationRun({
      userId: 'user-2',
      createdBy: 'user-1',
      role: 'admin',
    })).toBe(true)
    expect(canControlAppServiceGenerationRun({
      userId: 'user-2',
      createdBy: 'user-1',
      role: 'owner',
    })).toBe(true)
    expect(canControlAppServiceGenerationRun({
      userId: 'user-2',
      createdBy: 'user-1',
      role: 'member',
    })).toBe(false)
    expect(canControlAppServiceGenerationRun({
      userId: 'user-2',
      createdBy: 'user-1',
      role: null,
    })).toBe(false)
  })
})
