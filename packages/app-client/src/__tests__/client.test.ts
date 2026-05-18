import { describe, expect, it } from 'vitest'

import { createLucidAppClient } from '../client.js'
import type { NativeBootstrap } from '../schemas.js'

const bootstrap: NativeBootstrap = {
  app: {
    name: 'Lucid',
    version: '0.1.2',
    environment: 'test',
  },
  urls: {
    app: 'https://app.lucid.example',
  },
  features: {
    desktopDeepLinks: true,
    nativeDeviceRegistration: false,
    mobileCompanion: false,
    mobilePush: false,
  },
  desktop: {
    protocol: 'lucid',
    updateChannel: 'dev',
    minVersion: '0.1.0',
  },
  mobile: {
    minVersion: '0.1.0',
    pushProvider: 'expo',
  },
}

describe('LucidAppClient', () => {
  it('loads and validates the native bootstrap payload', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const client = createLucidAppClient({
      baseUrl: 'https://app.lucid.example',
      auth: { mode: 'bearer', token: 'native-token' },
      fetch: async (input, init) => {
        calls.push({
          url: input.toString(),
          authorization: new Headers(init?.headers).get('Authorization'),
        })
        return Response.json(bootstrap)
      },
    })

    await expect(client.getBootstrap()).resolves.toEqual(bootstrap)
    expect(calls).toEqual([
      {
        url: 'https://app.lucid.example/api/native/bootstrap',
        authorization: 'Bearer native-token',
      },
    ])
  })

  it('throws typed API errors with response metadata', async () => {
    const client = createLucidAppClient({
      baseUrl: 'https://app.lucid.example',
      fetch: async () => Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 }),
    })

    await expect(client.getBootstrap()).rejects.toMatchObject({
      name: 'LucidApiError',
      status: 401,
      code: 'unauthorized',
    })
  })

  it('sends native device registration through the typed client', async () => {
    const calls: Array<{ method: string | undefined; url: string; body: unknown }> = []
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
    } as const
    const client = createLucidAppClient({
      baseUrl: 'https://app.lucid.example',
      fetch: async (input, init) => {
        calls.push({
          method: init?.method,
          url: input.toString(),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        return Response.json({ device })
      },
    })

    await expect(
      client.registerDevice({
        platform: 'macos',
        appKind: 'desktop',
        installId: 'install-1',
      }),
    ).resolves.toEqual({ device })
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'https://app.lucid.example/api/native/devices',
        body: {
          platform: 'macos',
          appKind: 'desktop',
          installId: 'install-1',
        },
      },
    ])
  })
})
