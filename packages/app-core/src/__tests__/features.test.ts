import { describe, expect, it } from 'vitest'

import {
  LUCID_NATIVE_FEATURE_IDS,
  getLucidNativeFeature,
  isLucidNativeFeatureSupported,
  listLucidNativeFeatures,
  normalizeLucidNativeFeatureFlags,
} from '../features.js'

describe('Lucid native feature registry', () => {
  it('keeps bootstrap feature flags normalized around the shared registry', () => {
    expect(normalizeLucidNativeFeatureFlags({
      desktopDeepLinks: true,
      mobilePush: true,
      unknownFutureFlag: true,
    })).toMatchObject({
      desktopDeepLinks: true,
      mobilePush: true,
      nativeDeviceRegistration: false,
    })
  })

  it('describes the mobile agent command pillars in one shared contract', () => {
    const mobileMvp = listLucidNativeFeatures({ appKind: 'mobile', platform: 'ios', status: 'mvp' })
      .map((feature) => feature.id)

    expect(mobileMvp).toEqual(expect.arrayContaining([
      'approvalWallet',
      'liveRunControl',
      'commandCapture',
      'holdToTalk',
      'shareToLucid',
    ]))
  })

  it('keeps privileged native actions behind biometric confirmation', () => {
    const feature = getLucidNativeFeature('agentActionLinks')

    expect(feature.risk).toBe('privileged')
    expect(feature.auth).toBe('biometric-confirmation')
  })

  it('keeps platform support explicit for desktop-only and mobile-only surfaces', () => {
    expect(isLucidNativeFeatureSupported('desktopTrayControl', { appKind: 'desktop', platform: 'macos' })).toBe(true)
    expect(isLucidNativeFeatureSupported('desktopTrayControl', { appKind: 'mobile', platform: 'ios' })).toBe(false)
    expect(isLucidNativeFeatureSupported('lockScreenLiveActivity', { appKind: 'mobile', platform: 'ios' })).toBe(true)
    expect(isLucidNativeFeatureSupported('lockScreenLiveActivity', { appKind: 'mobile', platform: 'android' })).toBe(false)
  })

  it('uses stable feature IDs for backend, desktop, and mobile gates', () => {
    expect(LUCID_NATIVE_FEATURE_IDS).toContain('desktopDeepLinks')
    expect(LUCID_NATIVE_FEATURE_IDS).toContain('nativeDeviceRegistration')
    expect(LUCID_NATIVE_FEATURE_IDS).toContain('mobileCompanion')
    expect(LUCID_NATIVE_FEATURE_IDS).toContain('mobilePush')
  })
})
