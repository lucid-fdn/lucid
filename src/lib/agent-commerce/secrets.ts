import 'server-only'

import crypto from 'crypto'
import { AgentCommerceError } from './errors'

const INLINE_SECRET_PREFIX = 'agent-commerce-secret:v1:'
const ENV_SECRET_PREFIX = 'env:'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export type AgentCommerceSecretKind =
  | 'provider_api_key'
  | 'payment_credential'
  | 'oauth_token'
  | 'wallet_credential'
  | 'webhook_secret'
  | 'other'

export interface AgentCommerceSecretEnvelope {
  kind: AgentCommerceSecretKind
  provider?: string
  value: string
  created_at: string
  metadata: Record<string, unknown>
}

function deriveAgentCommerceSecretKey(env: Record<string, string | undefined> = process.env): Buffer {
  const key = env.AGENT_COMMERCE_SECRET_ENCRYPTION_KEY
    || env.CREDENTIALS_ENCRYPTION_KEY
    || env.ENCRYPTION_KEY

  if (!key || key.trim().length < 32) {
    throw new AgentCommerceError(
      'internal_error',
      'Agent Commerce secret encryption key is not configured.',
      500,
    )
  }

  return crypto.createHash('sha256').update(key.trim()).digest()
}

function encodePayload(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(payload: string): Record<string, string> {
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, string>
      : {}
  } catch {
    throw new AgentCommerceError('validation_failed', 'Invalid Agent Commerce secret reference.', 400)
  }
}

function aad(kind: AgentCommerceSecretKind, provider?: string): Buffer {
  return Buffer.from(`agent-commerce:${kind}:${provider ?? 'provider-neutral'}`, 'utf8')
}

export function createAgentCommerceEnvSecretRef(envName: string): string {
  const normalized = envName.trim()
  if (!/^[A-Z0-9_]+$/.test(normalized)) {
    throw new AgentCommerceError('validation_failed', 'Invalid environment secret name.', 400)
  }
  return `${ENV_SECRET_PREFIX}${normalized}`
}

export function createAgentCommerceSecretRef(params: {
  value: string
  kind: AgentCommerceSecretKind
  provider?: string
  metadata?: Record<string, unknown>
  env?: Record<string, string | undefined>
}): string {
  if (!params.value.trim()) {
    throw new AgentCommerceError('validation_failed', 'Secret value is required.', 400)
  }

  const key = deriveAgentCommerceSecretKey(params.env)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(params.kind, params.provider))

  const envelope: AgentCommerceSecretEnvelope = {
    kind: params.kind,
    provider: params.provider,
    value: params.value,
    created_at: new Date().toISOString(),
    metadata: params.metadata ?? {},
  }
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(envelope), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${INLINE_SECRET_PREFIX}${encodePayload({
    kind: params.kind,
    provider: params.provider ?? '',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  })}`
}

export function resolveAgentCommerceSecretRef(params: {
  secretRef: string
  expectedKind?: AgentCommerceSecretKind
  provider?: string
  env?: Record<string, string | undefined>
}): AgentCommerceSecretEnvelope {
  const secretRef = params.secretRef.trim()
  if (secretRef.startsWith(ENV_SECRET_PREFIX)) {
    const envName = secretRef.slice(ENV_SECRET_PREFIX.length)
    const value = params.env?.[envName] ?? process.env[envName]
    if (!value) {
      throw new AgentCommerceError('internal_error', `Agent Commerce env secret ${envName} is not configured.`, 500)
    }
    return {
      kind: params.expectedKind ?? 'other',
      provider: params.provider,
      value,
      created_at: new Date(0).toISOString(),
      metadata: { source: 'env', env_name: envName },
    }
  }

  if (!secretRef.startsWith(INLINE_SECRET_PREFIX)) {
    throw new AgentCommerceError('validation_failed', 'Unsupported Agent Commerce secret reference.', 400)
  }

  const payload = decodePayload(secretRef.slice(INLINE_SECRET_PREFIX.length))
  const kind = payload.kind as AgentCommerceSecretKind
  if (params.expectedKind && kind !== params.expectedKind) {
    throw new AgentCommerceError('validation_failed', 'Agent Commerce secret kind mismatch.', 400)
  }
  if (params.provider && payload.provider && payload.provider !== params.provider) {
    throw new AgentCommerceError('validation_failed', 'Agent Commerce secret provider mismatch.', 400)
  }

  try {
    const key = deriveAgentCommerceSecretKey(params.env)
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv ?? '', 'base64url'),
    )
    decipher.setAAD(aad(kind, payload.provider || undefined))
    decipher.setAuthTag(Buffer.from(payload.tag ?? '', 'base64url').subarray(0, TAG_LENGTH))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext ?? '', 'base64url')),
      decipher.final(),
    ]).toString('utf8')
    const envelope = JSON.parse(plaintext) as AgentCommerceSecretEnvelope
    return {
      ...envelope,
      provider: envelope.provider || undefined,
      metadata: envelope.metadata ?? {},
    }
  } catch {
    throw new AgentCommerceError('validation_failed', 'Agent Commerce secret reference could not be decrypted.', 400)
  }
}

export function maskAgentCommerceSecretRef(secretRef?: string | null): string | undefined {
  if (!secretRef) return undefined
  if (secretRef.startsWith(ENV_SECRET_PREFIX)) return `${ENV_SECRET_PREFIX}${secretRef.slice(ENV_SECRET_PREFIX.length)}`
  if (secretRef.startsWith(INLINE_SECRET_PREFIX)) return `${INLINE_SECRET_PREFIX}[encrypted]`
  return '[unsupported-secret-ref]'
}

export function isAgentCommerceSecretRef(value: string): boolean {
  return value.startsWith(ENV_SECRET_PREFIX) || value.startsWith(INLINE_SECRET_PREFIX)
}
