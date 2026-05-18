import { afterEach, describe, expect, it } from 'vitest'

import {
  getL2AdminApiKeyFromEnv,
  getL2ApiUrl,
  getL2GatewayBaseUrl,
  getPassportOwnerFallback,
} from './env'

const ENV_NAMES = [
  'LUCID_L2_API_URL',
  'LUCID_L2_ADMIN_KEY',
  'LUCID_PLATFORM_WALLET',
] as const

const originalEnv = Object.fromEntries(ENV_NAMES.map(name => [name, process.env[name]]))

function clearEnv() {
  for (const name of ENV_NAMES) delete process.env[name]
}

describe('Lucid L2 env resolution', () => {
  afterEach(() => {
    clearEnv()
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[name] = value
    }
  })

  it('resolves the canonical L2 API URL', () => {
    clearEnv()
    process.env.LUCID_L2_API_URL = 'https://canonical.example/api'

    expect(getL2ApiUrl()).toBe('https://canonical.example/api')
    expect(getL2GatewayBaseUrl()).toBe('https://canonical.example')
  })

  it('does not accept legacy L2 URL aliases', () => {
    clearEnv()
    process.env.LUCID_L2_URL = 'https://legacy.example/api/'

    expect(getL2ApiUrl()).toBeNull()
    expect(getL2GatewayBaseUrl()).toBeNull()
  })

  it('normalizes quoted env values from shell and dotenv files', () => {
    clearEnv()
    process.env.LUCID_L2_API_URL = '"https://quoted.example/api"'

    expect(getL2ApiUrl()).toBe('https://quoted.example/api')
    expect(getL2GatewayBaseUrl()).toBe('https://quoted.example')
  })

  it('resolves only the canonical admin key', () => {
    clearEnv()
    process.env.LUCID_L2_ADMIN_KEY = 'admin-key'
    process.env.LUCID_L2_API_KEY = 'legacy-key'

    expect(getL2AdminApiKeyFromEnv()).toBe('admin-key')
  })

  it('resolves only the canonical platform wallet', () => {
    clearEnv()
    process.env.LUCID_PLATFORM_WALLET = 'owner-address'
    process.env.PLATFORM_OWNER_ADDRESS = 'legacy-owner-address'

    expect(getPassportOwnerFallback()).toBe('owner-address')
  })
})
