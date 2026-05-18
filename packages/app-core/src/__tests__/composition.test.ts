import { describe, expect, it } from 'vitest'

import {
  createLucidNativeFeatureManifest,
  getLucidNativeFeatureComposition,
  listLucidNativeFeatureComposition,
} from '../composition.js'

describe('Lucid native feature composition', () => {
  it('builds a target-specific mobile manifest from the shared registry', () => {
    const manifest = createLucidNativeFeatureManifest({
      appKind: 'mobile',
      platform: 'ios',
      flags: {
        holdToTalk: true,
        shareToLucid: true,
      },
    })

    expect(manifest.map((item) => item.featureId)).toEqual(expect.arrayContaining(['holdToTalk', 'shareToLucid']))
    expect(manifest.find((item) => item.featureId === 'desktopTrayControl')).toBeUndefined()
    expect(manifest.find((item) => item.featureId === 'holdToTalk')).toMatchObject({
      enabled: true,
      requiredAuth: 'device-bound-session',
    })
  })

  it('centralizes voice, push, and action contracts for app clients', () => {
    expect(getLucidNativeFeatureComposition('holdToTalk').contracts).toContainEqual({
      kind: 'voice-command',
      clientMethod: 'createVoiceCommand',
      route: '/api/native/voice/commands',
      idempotent: false,
    })

    expect(getLucidNativeFeatureComposition('mobilePush').contracts).toContainEqual({
      kind: 'push-registration',
      clientMethod: 'registerPushToken',
      route: '/api/native/push/register',
      idempotent: true,
    })

    expect(getLucidNativeFeatureComposition('agentActionLinks').contracts).toContainEqual({
      kind: 'action-dispatch',
      clientMethod: 'dispatchNativeAction',
      route: '/api/native/actions/dispatch',
      idempotent: true,
    })
  })

  it('keeps desktop composition desktop-scoped', () => {
    const desktop = listLucidNativeFeatureComposition({ appKind: 'desktop', platform: 'macos' })
    const mobile = listLucidNativeFeatureComposition({ appKind: 'mobile', platform: 'ios' })

    expect(desktop.map((item) => item.featureId)).toContain('desktopCommandPalette')
    expect(mobile.map((item) => item.featureId)).not.toContain('desktopCommandPalette')
  })
})

