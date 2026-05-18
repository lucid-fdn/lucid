import 'server-only'

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function requireChannelEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be set to a 64-character hex string')
  }
  return key
}

export function hashChannelSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function encryptChannelSecrets(
  secrets: Record<string, string>,
  keyHex = requireChannelEncryptionKey(),
): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(keyHex, 'hex'), iv)
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decryptChannelSecrets(
  encrypted: string,
  keyHex = requireChannelEncryptionKey(),
): Record<string, string> {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted channel secrets format')
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(keyHex, 'hex'),
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted) as Record<string, string>
}
