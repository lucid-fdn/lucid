import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

import {
  NativeDeviceAccessError,
  NativeDeviceSecretError,
  hashNativeSecret,
  mapNativeDeviceRow,
  registerNativeDevice,
  sealNativePushToken,
} from '../native-devices'

const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('native device persistence helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashes push tokens deterministically and encrypts stored token material', () => {
    const sealed = sealNativePushToken('ExpoPushToken[token]', key)

    expect(sealed.push_token_hash).toBe(hashNativeSecret('ExpoPushToken[token]'))
    expect(sealed.push_token_encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/)
    expect(sealed.push_token_encrypted).not.toContain('ExpoPushToken')
  })

  it('refuses to store push tokens without encryption configuration', () => {
    expect(() => sealNativePushToken('secret', '')).toThrow(NativeDeviceSecretError)
  })

  it('maps DB rows without exposing encrypted push tokens', () => {
    const device = mapNativeDeviceRow({
      id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      org_id: null,
      platform: 'ios',
      app_kind: 'mobile',
      install_id: 'install-1',
      device_name: 'iPhone',
      app_version: '0.1.0',
      os_version: '18.0',
      push_provider: 'expo',
      push_token_hash: 'hash',
      push_token_encrypted: 'cipher',
      notification_settings: { approvals: true },
      metadata: { build: 'preview' },
      last_seen_at: '2026-05-17T10:00:00.000Z',
      revoked_at: null,
      created_at: '2026-05-17T10:00:00.000Z',
      updated_at: '2026-05-17T10:00:00.000Z',
    })

    expect(device).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      hasPushToken: true,
      notificationSettings: { approvals: true },
    })
    expect(JSON.stringify(device)).not.toContain('cipher')
  })

  it('requires org membership before registering an org-scoped native device', async () => {
    const membershipQuery = createSupabaseChain({ data: null, error: null })
    const devicesQuery = createSupabaseChain({ data: null, error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organization_members') return membershipQuery
      if (table === 'native_devices') return devicesQuery
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(registerNativeDevice('00000000-0000-4000-8000-000000000002', {
      orgId: '00000000-0000-4000-8000-000000000099',
      platform: 'ios',
      appKind: 'mobile',
      installId: 'install-1',
    })).rejects.toThrow(NativeDeviceAccessError)

    expect(membershipQuery.eq).toHaveBeenCalledWith('organization_id', '00000000-0000-4000-8000-000000000099')
    expect(membershipQuery.eq).toHaveBeenCalledWith('user_id', '00000000-0000-4000-8000-000000000002')
    expect(devicesQuery.upsert).not.toHaveBeenCalled()
  })
})

function createSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }

  return chain
}
