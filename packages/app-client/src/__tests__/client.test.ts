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

  it('centralizes native session, push, voice, and action endpoints', async () => {
    const calls: Array<{ method: string | undefined; url: string; body: unknown }> = []
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
        const url = input.toString()
        calls.push({
          method: init?.method,
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })

        if (url.endsWith('/api/native/session/handoff')) {
          return Response.json({
            handoffId: 'handoff-1',
            provider: 'privy',
            status: 'pending',
            authorizeUrl: 'https://app.lucid.example/sign-in?handoff=handoff-1',
            expiresAt: '2026-05-17T10:10:00.000Z',
          })
        }

        if (url.endsWith('/api/native/session/exchange')) {
          return Response.json({
            accessToken: 'native_access_1',
            refreshToken: 'native_refresh_1',
            expiresAt: '2026-05-17T11:10:00.000Z',
            deviceId: device.id,
          })
        }

        if (url.endsWith('/api/native/push/register')) {
          return Response.json({ device, topics: ['approvals', 'runs'] })
        }

        if (url.endsWith('/api/native/voice/commands')) {
          return Response.json({
            commandId: 'command-1',
            interpretedCommand: 'pause all checkout agents',
            responseText: 'I can pause the checkout agents after confirmation.',
            requiresConfirmation: true,
            confirmation: {
              actionId: 'pause-checkout',
              risk: 'confirmation-required',
              prompt: 'Pause all checkout agents?',
            },
          })
        }

        return Response.json({
          actionId: 'pause-checkout',
          status: 'queued',
          receiptId: 'receipt-1',
          message: 'Queued.',
        })
      },
    })

    await expect(
      client.createSessionHandoff({
        provider: 'privy',
        appKind: 'mobile',
        platform: 'ios',
        installId: 'install-1',
      }),
    ).resolves.toMatchObject({ handoffId: 'handoff-1' })
    await expect(
      client.exchangeSessionHandoff({
        handoffId: 'handoff-1',
        exchangeToken: 'native_exchange_1',
      }),
    ).resolves.toMatchObject({ accessToken: 'native_access_1', deviceId: device.id })
    await expect(
      client.registerPushToken({
        deviceId: device.id,
        provider: 'expo',
        token: 'ExponentPushToken[token]',
        topics: ['approvals', 'runs'],
      }),
    ).resolves.toMatchObject({ topics: ['approvals', 'runs'] })
    await expect(
      client.createVoiceCommand({
        deviceId: device.id,
        transcript: 'Pause all checkout agents',
      }),
    ).resolves.toMatchObject({ requiresConfirmation: true })
    await expect(
      client.dispatchNativeAction({
        featureId: 'liveRunControl',
        actionId: 'pause-checkout',
        deviceId: device.id,
        idempotencyKey: 'pause-checkout-1',
        payload: { scope: 'checkout' },
      }),
    ).resolves.toMatchObject({ status: 'queued' })

    expect(calls.map((call) => call.url)).toEqual([
      'https://app.lucid.example/api/native/session/handoff',
      'https://app.lucid.example/api/native/session/exchange',
      'https://app.lucid.example/api/native/push/register',
      'https://app.lucid.example/api/native/voice/commands',
      'https://app.lucid.example/api/native/actions/dispatch',
    ])
  })
})
