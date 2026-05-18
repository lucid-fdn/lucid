import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PublicRuntimeRequestKind } from './public-runtime-core'

export const PUBLIC_APP_TOKEN_PREFIX = 'lucid_pub_'

export interface AppPublicTokenRecord {
  app_deployment_id: string
  token_hash: string
  capabilities: string[]
  expires_at?: string | null
  revoked_at?: string | null
}

const KIND_CAPABILITIES: Record<PublicRuntimeRequestKind, string | null> = {
  config: 'status',
  discovery: 'status',
  status: 'status',
  session: 'status',
  chat: 'chat',
  lead: 'lead',
  feedback: 'feedback',
  action: 'public_actions',
  preflight: null,
}

export function createPublicAppTokenSecret(bytes = 32): string {
  return `${PUBLIC_APP_TOKEN_PREFIX}${randomBytes(bytes).toString('base64url')}`
}

export function publicAppTokenPreview(token: string): string {
  if (token.length <= PUBLIC_APP_TOKEN_PREFIX.length + 8) return `${PUBLIC_APP_TOKEN_PREFIX}...`
  return `${token.slice(0, PUBLIC_APP_TOKEN_PREFIX.length + 6)}...${token.slice(-4)}`
}

export function hashPublicAppToken(token: string, pepper = ''): string {
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex')
}

export function publicAppTokenHashMatches(token: string, hash: string, pepper = ''): boolean {
  const candidate = hashPublicAppToken(token, pepper)
  const left = Buffer.from(candidate)
  const right = Buffer.from(hash)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function isPublicAppTokenUsable(
  token: AppPublicTokenRecord,
  now = new Date(),
): boolean {
  if (token.revoked_at) return false
  if (!token.expires_at) return true
  const expiresAt = Date.parse(token.expires_at)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export function publicAppTokenAllowsKind(
  capabilities: string[],
  kind: PublicRuntimeRequestKind,
): boolean {
  const requiredCapability = KIND_CAPABILITIES[kind]
  if (!requiredCapability) return true
  if (capabilities.length === 0) return true
  if (kind === 'action' && capabilities.includes('paid_actions')) return true
  return capabilities.includes(requiredCapability)
}

export function buildPublicTokenRotationUpdate(now = new Date()): { revoked_at: string } {
  return { revoked_at: now.toISOString() }
}
