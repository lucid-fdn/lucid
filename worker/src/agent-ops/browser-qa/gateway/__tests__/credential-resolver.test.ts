import { describe, expect, it } from 'vitest'
import {
  assertBrowserGatewayRuntimePacketSafe,
  evaluateBrowserGatewayCredentialAccess,
} from '../credential-resolver.js'

const runtimeRef = {
  id: 'credential-ref-1',
  browser_account_id: 'account-1',
  provider: 'steel',
  storage_owner: 'merchant_session' as const,
  credential_kind: 'merchant_session',
  status: 'active',
}

describe('Browser gateway credential resolver', () => {
  it('allows session/profile refs without exposing secret handles', () => {
    expect(evaluateBrowserGatewayCredentialAccess({
      credentialRef: runtimeRef,
      rawCredentialsEnabled: false,
      enabledFeatureFlags: [],
    })).toMatchObject({
      allowed: true,
      reasonCodes: [],
      runtimeRef,
    })
  })

  it('blocks raw credentials unless the explicit feature flag is enabled', () => {
    const rawRef = {
      ...runtimeRef,
      storage_owner: 'lucid_vault' as const,
      credential_kind: 'password',
      requires_feature_flag: 'browser_operator_raw_credentials',
      consent_grant_id: 'consent-1',
    }

    expect(evaluateBrowserGatewayCredentialAccess({
      credentialRef: rawRef,
      rawCredentialsEnabled: false,
      enabledFeatureFlags: [],
    })).toMatchObject({
      allowed: false,
      reasonCodes: ['raw_credentials_disabled'],
    })

    expect(evaluateBrowserGatewayCredentialAccess({
      credentialRef: rawRef,
      rawCredentialsEnabled: true,
      enabledFeatureFlags: ['browser_operator_raw_credentials'],
    })).toMatchObject({
      allowed: true,
    })
  })

  it('fails closed if a runtime packet carries secret fields', () => {
    expect(() => assertBrowserGatewayRuntimePacketSafe({
      targetId: 'target-1',
      credentialRef: {
        id: 'credential-ref-1',
        secret_ref: 'vault://nope',
      },
    })).toThrow(/forbidden secret fields/i)
  })
})
