import { describe, expect, it } from 'vitest'
import {
  BrowserOperatorCredentialRefSchema,
  classifyBrowserOperatorActionRisk,
} from '@contracts/browser-operator'
import {
  assertBrowserOperatorRuntimePacketSafe,
  evaluateBrowserOperatorCredentialAccess,
  sanitizeBrowserOperatorCredentialRef,
} from '../credential-safety'

const baseCredentialRef = {
  id: '5b176b16-8350-42c6-9086-6d3a92e7d2c8',
  org_id: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
  user_id: '70f97bc6-c5b6-4622-9d0e-15768c8444cc',
  browser_account_id: '5a7f0c51-3f3a-4477-9707-6ca8d948aee5',
  provider: 'steel',
  storage_owner: 'merchant_session',
  secret_ref: 'vault://session/ref',
  credential_kind: 'merchant_session',
  status: 'active',
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
} as const

describe('Browser Operator credential safety', () => {
  it('sanitizes credential refs before runtime packets', () => {
    const runtimeRef = sanitizeBrowserOperatorCredentialRef(baseCredentialRef)

    expect(runtimeRef).toMatchObject({
      id: baseCredentialRef.id,
      browser_account_id: baseCredentialRef.browser_account_id,
      credential_kind: 'merchant_session',
    })
    expect(JSON.stringify(runtimeRef)).not.toContain('vault://session/ref')
    expect(runtimeRef).not.toHaveProperty('secret_ref')
  })

  it('blocks raw credentials unless explicit feature flag and consent are present', () => {
    const ref = BrowserOperatorCredentialRefSchema.parse({
      ...baseCredentialRef,
      storage_owner: 'lucid_vault',
      credential_kind: 'password',
      requires_feature_flag: 'browser_operator_raw_credentials',
      consent_grant_id: 'consent-1',
    })

    expect(evaluateBrowserOperatorCredentialAccess({
      credentialRef: ref,
      rawCredentialsEnabled: false,
      enabledFeatureFlags: [],
    })).toMatchObject({
      allowed: false,
      reasonCodes: ['raw_credentials_disabled'],
      auditEventType: 'credential_access.raw_denied',
    })

    expect(evaluateBrowserOperatorCredentialAccess({
      credentialRef: ref,
      rawCredentialsEnabled: true,
      enabledFeatureFlags: ['browser_operator_raw_credentials'],
    })).toMatchObject({
      allowed: true,
      auditEventType: 'credential_access.allowed',
    })
  })

  it('rejects raw credential rows without feature flag and consent', () => {
    expect(() => BrowserOperatorCredentialRefSchema.parse({
      ...baseCredentialRef,
      storage_owner: 'lucid_vault',
      credential_kind: 'password',
    })).toThrow(/feature flag/i)
  })

  it('rejects runtime packets that contain secret handles', () => {
    expect(() => assertBrowserOperatorRuntimePacketSafe({
      browserAccountId: 'account-1',
      credentialRef: {
        id: 'ref-1',
        secret_ref: 'vault://must-not-cross-runtime',
      },
    })).toThrow(/forbidden secret fields/i)
  })

  it('classifies action risk deterministically', () => {
    expect(classifyBrowserOperatorActionRisk('screenshot')).toBe('read_only')
    expect(classifyBrowserOperatorActionRisk('click')).toBe('low')
    expect(classifyBrowserOperatorActionRisk('add_to_cart')).toBe('medium')
    expect(classifyBrowserOperatorActionRisk('purchase')).toBe('high')
  })
})
