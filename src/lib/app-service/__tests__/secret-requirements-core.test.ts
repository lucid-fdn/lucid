import { describe, expect, it } from 'vitest'
import {
  appSecretRequirementEventType,
  buildAppSecretRequirementAuditPayload,
  parseAppSecretRequirementConnectionInput,
} from '../secret-requirements-core'

describe('secret requirements core', () => {
  it('accepts server env and encrypted secret store references without plaintext values', () => {
    const serverEnv = parseAppSecretRequirementConnectionInput({
      action: 'connected',
      source: 'server_env',
      reference: 'SALES_HANDOFF_EMAIL',
      provider: 'email',
    })
    const encryptedStore = parseAppSecretRequirementConnectionInput({
      action: 'changed',
      source: 'encrypted_secret_store',
      reference: 'secret://app-services/support/SLACK_WEBHOOK_URL',
    })

    expect(serverEnv.source).toBe('server_env')
    expect(encryptedStore.source).toBe('encrypted_secret_store')
    expect(appSecretRequirementEventType('connected')).toBe('app_secret_requirement_connected')
    expect(appSecretRequirementEventType('changed')).toBe('app_secret_requirement_changed')
  })

  it('rejects plaintext secret-looking fields and values', () => {
    expect(() => parseAppSecretRequirementConnectionInput({
      source: 'encrypted_secret_store',
      reference: 'secret://app/support/key',
      token: 'sk-live-secretsecretsecret',
    })).toThrow('Plaintext secret field')

    expect(() => parseAppSecretRequirementConnectionInput({
      source: 'server_env',
      reference: 'V0_API_KEY',
      note: 'rotate sk-live-secretsecretsecret immediately',
    })).toThrow('Plaintext secret value')
  })

  it('builds audit payloads without accepting plaintext material', () => {
    const connection = parseAppSecretRequirementConnectionInput({
      action: 'connected',
      source: 'server_env',
      reference: 'OPS_ALERT_WEBHOOK',
    })

    expect(buildAppSecretRequirementAuditPayload({
      key: 'OPS_ALERT_WEBHOOK',
      userId: 'user-1',
      connection,
    })).toMatchObject({
      secret_requirement_key: 'OPS_ALERT_WEBHOOK',
      action: 'connected',
      source: 'server_env',
      reference: 'OPS_ALERT_WEBHOOK',
      changed_by: 'user-1',
      plaintext_secret_received: false,
      allowed_secret_sources: ['server_env', 'encrypted_secret_store'],
    })
  })
})
