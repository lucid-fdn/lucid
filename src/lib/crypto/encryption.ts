import 'server-only'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.PROVIDER_KEYS_ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'PROVIDER_KEYS_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a provider API key using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptProviderKey(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a provider API key encrypted with encryptProviderKey().
 */
export function decryptProviderKey(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format')
  }

  const [ivHex, authTagHex, cipherHex] = parts

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Generate a safe preview of an API key (first 4 + last 4 chars).
 * e.g. "sk-pr...xY9z"
 */
export function generateKeyPreview(key: string): string {
  if (key.length <= 12) return '****'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

/**
 * Validate key format for known providers (basic sanity check).
 * Returns true for unknown providers (permissive).
 */
export function validateProviderKeyFormat(
  provider: string,
  key: string
): { valid: boolean; error?: string } {
  if (!key || key.length < 10) {
    return { valid: false, error: 'API key is too short' }
  }

  const checks: Record<string, { prefix: string; minLength: number }> = {
    openai: { prefix: 'sk-', minLength: 20 },
    anthropic: { prefix: 'sk-ant-', minLength: 40 },
    groq: { prefix: 'gsk_', minLength: 20 },
    cohere: { prefix: '', minLength: 20 },
    google: { prefix: '', minLength: 20 },
    mistral: { prefix: '', minLength: 20 },
    perplexity: { prefix: 'pplx-', minLength: 20 },
    deepseek: { prefix: 'sk-', minLength: 20 },
    together: { prefix: '', minLength: 20 },
    fireworks: { prefix: '', minLength: 20 },
    openrouter: { prefix: 'sk-or-', minLength: 20 },
  }

  const check = checks[provider]
  if (!check) return { valid: true }

  if (check.prefix && !key.startsWith(check.prefix)) {
    return {
      valid: false,
      error: `${provider} keys should start with "${check.prefix}"`,
    }
  }

  if (key.length < check.minLength) {
    return {
      valid: false,
      error: `${provider} key seems too short (expected at least ${check.minLength} characters)`,
    }
  }

  return { valid: true }
}