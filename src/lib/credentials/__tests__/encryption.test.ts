import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  encryptCredential,
  decryptCredential,
  isEncryptionConfigured,
  generateEncryptionKey,
  maskCredentialData,
  validateCredentialData,
} from '../encryption'

const TEST_ENCRYPTION_KEY = 'a]3Fj!kL9#mNpQ7rStUvWxYz012345678'
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

describe('encryption', () => {
  beforeEach(() => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  describe('encryptCredential / decryptCredential round-trip', () => {
    it('should encrypt and decrypt a simple string value', { timeout: 15_000 }, () => {
      const data = 'my-secret-api-key'
      const encrypted = encryptCredential(data)
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('should encrypt and decrypt a plain object', { timeout: 15_000 }, () => {
      const data = { username: 'admin', password: 's3cret!' }
      const encrypted = encryptCredential(data)
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('should encrypt and decrypt nested objects', { timeout: 15_000 }, () => {
      const data = {
        oauth: {
          accessToken: 'tok_abc',
          refreshToken: 'ref_xyz',
          scopes: ['read', 'write'],
        },
        meta: { createdAt: '2025-01-01' },
      }
      const encrypted = encryptCredential(data)
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('should produce different ciphertext for the same plaintext (random IV/salt)', { timeout: 15_000 }, () => {
      const data = { key: 'same-value' }
      const encrypted1 = encryptCredential(data)
      const encrypted2 = encryptCredential(data)
      expect(encrypted1).not.toEqual(encrypted2)
    })

    it('should return a base64 encoded string', () => {
      const encrypted = encryptCredential({ test: true })
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
      // Re-encoding should produce the same string (valid base64)
      const buf = Buffer.from(encrypted, 'base64')
      expect(buf.toString('base64')).toEqual(encrypted)
    })
  })

  describe('error handling', () => {
    it('should throw when CREDENTIALS_ENCRYPTION_KEY is not set', () => {
      vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', '')
      expect(() => encryptCredential({ a: 1 })).toThrow('Failed to encrypt credential data')
    })

    it('should throw when CREDENTIALS_ENCRYPTION_KEY is too short', () => {
      vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'short')
      expect(() => encryptCredential({ a: 1 })).toThrow('Failed to encrypt credential data')
    })

    it('should throw when decrypting invalid data', () => {
      expect(() => decryptCredential('not-valid-encrypted-data')).toThrow(
        'Failed to decrypt credential data'
      )
    })

    it('should throw when decrypting with a different key', () => {
      const encrypted = encryptCredential({ secret: 'value' })
      vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'a-completely-different-key-that-is-long-enough!!')
      expect(() => decryptCredential(encrypted)).toThrow('Failed to decrypt credential data')
    })
  })

  describe('isEncryptionConfigured', () => {
    it('should return true when a valid key is set', () => {
      expect(isEncryptionConfigured()).toBe(true)
    })

    it('should return false when the key is not set', () => {
      vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', '')
      expect(isEncryptionConfigured()).toBe(false)
    })

    it('should return false when the key is too short', () => {
      vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'short')
      expect(isEncryptionConfigured()).toBe(false)
    })
  })

  describe('generateEncryptionKey', () => {
    it('should return a base64-encoded string', () => {
      const key = generateEncryptionKey()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(() => Buffer.from(key, 'base64')).not.toThrow()
    })

    it('should generate unique keys each time', () => {
      const key1 = generateEncryptionKey()
      const key2 = generateEncryptionKey()
      expect(key1).not.toEqual(key2)
    })
  })

  describe('maskCredentialData', () => {
    it('should mask api_key type', () => {
      const result = maskCredentialData(
        { key: 'sk-abc123', headerName: 'Authorization', prefix: 'Bearer' },
        'api_key'
      )
      expect(result.key).toBe('••••••••')
      expect(result.headerName).toBe('Authorization')
      expect(result.prefix).toBe('Bearer')
    })

    it('should mask basic_auth type', () => {
      const result = maskCredentialData(
        { username: 'admin', password: 'secret' },
        'basic_auth'
      )
      expect(result.username).toBe('admin')
      expect(result.password).toBe('••••••••')
    })

    it('should mask oauth2 type', () => {
      const result = maskCredentialData(
        { accessToken: 'tok_abc', refreshToken: 'ref_xyz', expiresAt: 12345 },
        'oauth2'
      )
      expect(result.accessToken).toBe('••••••••')
      expect(result.refreshToken).toBe('••••••••')
      expect(result.expiresAt).toBe(12345)
    })

    it('should mask sensitive custom_headers and leave non-sensitive ones', () => {
      const result = maskCredentialData(
        { headers: { 'Authorization': 'Bearer tok', 'Content-Type': 'application/json' } },
        'custom_headers'
      )
      expect(result.headers['Authorization']).toBe('••••••••')
      expect(result.headers['Content-Type']).toBe('application/json')
    })

    it('should return generic mask for unknown type', () => {
      const result = maskCredentialData({ foo: 'bar' }, 'unknown_type')
      expect(result).toEqual({ masked: true })
    })
  })

  describe('validateCredentialData', () => {
    it('should validate a valid api_key', () => {
      expect(validateCredentialData('api_key', { key: 'sk-abc' })).toEqual({ valid: true })
    })

    it('should reject api_key without key', () => {
      const result = validateCredentialData('api_key', {})
      expect(result.valid).toBe(false)
      expect(result.error).toBe('API key is required')
    })

    it('should validate a valid basic_auth', () => {
      expect(
        validateCredentialData('basic_auth', { username: 'admin', password: 'pass' })
      ).toEqual({ valid: true })
    })

    it('should reject basic_auth without password', () => {
      const result = validateCredentialData('basic_auth', { username: 'admin' })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Password is required')
    })

    it('should validate a valid oauth2', () => {
      expect(validateCredentialData('oauth2', { accessToken: 'tok' })).toEqual({ valid: true })
    })

    it('should reject oauth2 without accessToken', () => {
      const result = validateCredentialData('oauth2', {})
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Access token is required')
    })

    it('should validate valid custom_headers', () => {
      expect(
        validateCredentialData('custom_headers', { headers: { 'X-Api-Key': 'abc' } })
      ).toEqual({ valid: true })
    })

    it('should reject custom_headers without headers object', () => {
      const result = validateCredentialData('custom_headers', {})
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Headers object is required')
    })

    it('should reject an unknown credential type', () => {
      const result = validateCredentialData('unknown', { data: 'value' })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid credential type')
    })
  })
})
