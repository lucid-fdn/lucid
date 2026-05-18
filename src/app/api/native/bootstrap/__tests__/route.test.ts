import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../route'

describe('/api/native/bootstrap', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the native bootstrap contract without caching', async () => {
    vi.stubEnv('LUCID_NATIVE_APP_URL', 'https://app.lucid.example/')
    vi.stubEnv('LUCID_DESKTOP_UPDATE_CHANNEL', 'beta')
    vi.stubEnv('LUCID_NATIVE_HOLD_TO_TALK_ENABLED', 'true')
    vi.stubEnv('LUCID_NATIVE_COMMAND_CAPTURE_ENABLED', '1')

    const request = new NextRequest('https://control.lucid.example/api/native/bootstrap')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(payload).toMatchObject({
      app: {
        name: 'Lucid',
      },
      urls: {
        app: 'https://app.lucid.example',
      },
      features: {
        desktopDeepLinks: true,
        nativeDeviceRegistration: false,
        commandCapture: true,
        holdToTalk: true,
        shareToLucid: false,
      },
      desktop: {
        protocol: 'lucid',
        updateChannel: 'beta',
      },
      mobile: {
        pushProvider: 'expo',
      },
    })
  })
})
