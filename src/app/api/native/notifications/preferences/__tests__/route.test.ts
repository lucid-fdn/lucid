import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockListNativeDevices = vi.fn()
const mockUpdateNativeDevice = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/db/native-devices', () => ({
  listNativeDevices: (...args: unknown[]) => mockListNativeDevices(...args),
  updateNativeDevice: (...args: unknown[]) => mockUpdateNativeDevice(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

import { GET, PATCH } from '../route'

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

describe('/api/native/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000002')
  })

  it('lists notification preferences by device', async () => {
    mockListNativeDevices.mockResolvedValue([device])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      devices: [
        {
          id: device.id,
          appKind: 'mobile',
          platform: 'ios',
          notificationSettings: { approvals: true },
        },
      ],
    })
  })

  it('updates notification preferences for a device', async () => {
    mockUpdateNativeDevice.mockResolvedValue(device)
    const request = new NextRequest('https://app.lucid.example/api/native/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        deviceId: device.id,
        notificationSettings: { approvals: true },
      }),
    })

    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(mockUpdateNativeDevice).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', device.id, {
      notificationSettings: { approvals: true },
    })
  })
})
