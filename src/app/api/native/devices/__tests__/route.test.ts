import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockListNativeDevices = vi.fn()
const mockRegisterNativeDevice = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/db/native-devices', () => ({
  listNativeDevices: (...args: unknown[]) => mockListNativeDevices(...args),
  registerNativeDevice: (...args: unknown[]) => mockRegisterNativeDevice(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

import { GET, POST } from '../route'

const device = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  orgId: null,
  platform: 'macos',
  appKind: 'desktop',
  installId: 'install-1',
  deviceName: 'MacBook Pro',
  appVersion: '0.1.0',
  osVersion: '15.0',
  pushProvider: 'desktop-local',
  hasPushToken: false,
  notificationSettings: {},
  metadata: {},
  lastSeenAt: '2026-05-17T10:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-05-17T10:00:00.000Z',
  updatedAt: '2026-05-17T10:00:00.000Z',
}

describe('/api/native/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000002')
  })

  it('lists native devices for the authenticated user', async () => {
    mockListNativeDevices.mockResolvedValue([device])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ devices: [device] })
    expect(mockListNativeDevices).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002')
  })

  it('registers a native device with validated input', async () => {
    mockRegisterNativeDevice.mockResolvedValue(device)
    const request = new NextRequest('https://app.lucid.example/api/native/devices', {
      method: 'POST',
      body: JSON.stringify({
        platform: 'macos',
        appKind: 'desktop',
        installId: 'install-1',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ device })
    expect(mockRegisterNativeDevice).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', {
      platform: 'macos',
      appKind: 'desktop',
      installId: 'install-1',
    })
  })

  it('rejects invalid registration payloads', async () => {
    const request = new NextRequest('https://app.lucid.example/api/native/devices', {
      method: 'POST',
      body: JSON.stringify({ platform: 'macos' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockRegisterNativeDevice).not.toHaveBeenCalled()
  })

  it('forbids org-scoped registration when membership validation fails', async () => {
    const error = new Error('not a member')
    error.name = 'NativeDeviceAccessError'
    mockRegisterNativeDevice.mockRejectedValue(error)

    const request = new NextRequest('https://app.lucid.example/api/native/devices', {
      method: 'POST',
      body: JSON.stringify({
        orgId: '00000000-0000-4000-8000-000000000099',
        platform: 'ios',
        appKind: 'mobile',
        installId: 'install-1',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })
})
