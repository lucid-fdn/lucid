import 'server-only'

import { supabase } from '@/lib/db/client'
import { AppServiceError } from './errors'
import type { PublicRuntimeRequestKind } from './public-runtime-core'
import {
  buildPublicTokenRotationUpdate,
  createPublicAppTokenSecret,
  hashPublicAppToken,
  isPublicAppTokenUsable,
  publicAppTokenAllowsKind,
  publicAppTokenPreview,
  type AppPublicTokenRecord,
} from './public-tokens-core'
import { redactAppServiceMetadata } from './security-redaction'

export interface CreatedAppPublicToken {
  id: string
  token: string
  token_preview: string
  expires_at: string | null
  capabilities: string[]
}

interface PublicTokenRow extends AppPublicTokenRecord {
  id: string
  label: string | null
  created_by: string | null
  created_at: string
}

function tokenPepper() {
  return process.env.APP_SERVICE_PUBLIC_TOKEN_PEPPER || process.env.APP_SERVICE_INTERNAL_SECRET || ''
}

function normalizeCapabilities(capabilities: string[] | undefined): string[] {
  return [...new Set(capabilities ?? [])].filter(Boolean).sort()
}

export async function createAppPublicToken(params: {
  appDeploymentId: string
  label?: string | null
  capabilities?: string[]
  expiresAt?: string | null
  createdBy?: string | null
}): Promise<CreatedAppPublicToken> {
  const token = createPublicAppTokenSecret()
  const capabilities = normalizeCapabilities(params.capabilities)
  const { data, error } = await supabase
    .from('app_public_tokens')
    .insert({
      app_deployment_id: params.appDeploymentId,
      token_hash: hashPublicAppToken(token, tokenPepper()),
      token_preview: publicAppTokenPreview(token),
      label: params.label ?? null,
      capabilities,
      expires_at: params.expiresAt ?? null,
      created_by: params.createdBy ?? null,
    })
    .select('id, token_preview, capabilities, expires_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('App public token creation returned no row')
  }

  return {
    id: String(data.id),
    token,
    token_preview: typeof data.token_preview === 'string' ? data.token_preview : publicAppTokenPreview(token),
    expires_at: typeof data.expires_at === 'string' ? data.expires_at : null,
    capabilities: Array.isArray(data.capabilities) ? data.capabilities.filter((item): item is string => typeof item === 'string') : [],
  }
}

export async function revokeAppPublicToken(params: {
  appDeploymentId: string
  tokenId: string
  revokedAt?: Date
}): Promise<void> {
  const { error } = await supabase
    .from('app_public_tokens')
    .update(buildPublicTokenRotationUpdate(params.revokedAt))
    .eq('id', params.tokenId)
    .eq('app_deployment_id', params.appDeploymentId)
    .is('revoked_at', null)

  if (error) throw error
}

export async function rotateAppPublicToken(params: {
  appDeploymentId: string
  tokenId: string
  label?: string | null
  capabilities?: string[]
  expiresAt?: string | null
  createdBy?: string | null
}): Promise<CreatedAppPublicToken> {
  await revokeAppPublicToken({
    appDeploymentId: params.appDeploymentId,
    tokenId: params.tokenId,
  })
  return createAppPublicToken(params)
}

export async function validatePublicAppRuntimeToken(params: {
  appDeploymentId: string
  token: string | null
  kind: PublicRuntimeRequestKind
}): Promise<PublicTokenRow | null> {
  if (!params.token) return null

  const tokenHash = hashPublicAppToken(params.token, tokenPepper())
  const { data, error } = await supabase
    .from('app_public_tokens')
    .select('id, app_deployment_id, token_hash, label, capabilities, expires_at, revoked_at, created_by, created_at')
    .eq('app_deployment_id', params.appDeploymentId)
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new AppServiceError('forbidden', 'Public runtime token is invalid for this generated app.', 403)
  }

  const row = redactAppServiceMetadata(data as unknown as Record<string, unknown>) as unknown as PublicTokenRow
  if (!isPublicAppTokenUsable(row)) {
    throw new AppServiceError('token_revoked', 'Public runtime token is revoked or expired.', 401)
  }

  if (!publicAppTokenAllowsKind(row.capabilities ?? [], params.kind)) {
    throw new AppServiceError('forbidden', 'Public runtime token does not allow this capability.', 403)
  }

  return row
}
