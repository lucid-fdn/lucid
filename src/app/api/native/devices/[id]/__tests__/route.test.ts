import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockUpdateNativeDevice = vi.fn()
const mockRevokeNativeDevice = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/db/native-devices', () => ({
  updateNativeDevice: (...args: unknown[]) => mockUpdateNativeDevice(...args),
  revokeNativeDevice: (...args: unknown[]) => mockRevokeNativeDevice(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

import { DELETE, PATCH } from '../route'

const device = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  orgId: null,
  platform: 'ios',
  appKind: 'mobile',
  installId: 'install-1',
  deviceName: 'iPhone',
  appVersion: '0.1.0',
  osVersion: '18.0',
  pushProvider: 'expo',
  hasPushToken: true,
  notificationSettings: { approvals: true },
  metadata: {},
  lastSeenAt: '2026-05-17T10:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-05-17T10:00:00.000Z',
  updatedAt: '2026-05-17T10:00:00.000Z',
}

describe('/api/native/devices/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000002')
  })

  it('updates an owned native device', async () => {
    mockUpdateNativeDevice.mockResolvedValue(device)
    const request = new NextRequest('https://app.lucid.example/api/native/devices/device-1', {
      method: 'PATCH',
      body: JSON.stringify({ notificationSettings: { approvals: true } }),
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'device-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ device })
    expect(mockUpdateNativeDevice).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', 'device-1', {
      notificationSettings: { approvals: true },
    })
  })

  it('revokes an owned native device', async () => {
    mockRevokeNativeDevice.mockResolvedValue(undefined)
    const request = new NextRequest('https://app.lucid.example/api/native/devices/device-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'device-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockRevokeNativeDevice).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', 'device-1')
  })
})
