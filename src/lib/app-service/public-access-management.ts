import 'server-only'

import { z } from 'zod'
import { supabase } from '@/lib/db/client'
import { AppServiceError } from './errors'
import {
  createAppPublicToken,
  revokeAppPublicToken,
  rotateAppPublicToken,
  type CreatedAppPublicToken,
} from './public-tokens'

export const OperatorPublicTokenCreateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).default([]),
  expires_at: z.string().datetime().nullable().optional(),
})

export type OperatorPublicTokenCreate = z.infer<typeof OperatorPublicTokenCreateSchema>

export interface OperatorPublicToken {
  id: string
  label: string | null
  token_preview: string | null
  capabilities: string[]
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface OperatorAllowedOrigin {
  id: string
  origin: string
  source: string
  created_by: string | null
  created_at: string
}

export function normalizeAppAllowedOrigin(origin: string): string {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('origin must not include credentials, path, query, or hash')
    }
    return `${url.protocol}//${url.host}`
  } catch {
    throw new AppServiceError('validation_failed', 'Allowed origin must be an http(s) origin such as https://app.example.com.', 400)
  }
}

export async function listOperatorPublicTokens(appDeploymentId: string): Promise<OperatorPublicToken[]> {
  const { data, error } = await supabase
    .from('app_public_tokens')
    .select('id, label, token_preview, capabilities, expires_at, revoked_at, created_at')
    .eq('app_deployment_id', appDeploymentId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: typeof row.label === 'string' ? row.label : null,
    token_preview: typeof row.token_preview === 'string' ? row.token_preview : null,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.filter((item): item is string => typeof item === 'string') : [],
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    created_at: String(row.created_at),
  }))
}

export async function createOperatorPublicToken(params: {
  appDeploymentId: string
  input: unknown
  userId: string
}): Promise<CreatedAppPublicToken> {
  const input = OperatorPublicTokenCreateSchema.parse(params.input)
  return createAppPublicToken({
    appDeploymentId: params.appDeploymentId,
    label: input.label,
    capabilities: input.capabilities,
    expiresAt: input.expires_at,
    createdBy: params.userId,
  })
}

export async function rotateOperatorPublicToken(params: {
  appDeploymentId: string
  tokenId: string
  input: unknown
  userId: string
}): Promise<CreatedAppPublicToken> {
  const input = OperatorPublicTokenCreateSchema.parse(params.input)
  return rotateAppPublicToken({
    appDeploymentId: params.appDeploymentId,
    tokenId: params.tokenId,
    label: input.label,
    capabilities: input.capabilities,
    expiresAt: input.expires_at,
    createdBy: params.userId,
  })
}

export async function revokeOperatorPublicToken(params: {
  appDeploymentId: string
  tokenId: string
}): Promise<void> {
  await revokeAppPublicToken({
    appDeploymentId: params.appDeploymentId,
    tokenId: params.tokenId,
  })
}

export async function listOperatorAllowedOrigins(appDeploymentId: string): Promise<OperatorAllowedOrigin[]> {
  const { data, error } = await supabase
    .from('app_allowed_origins')
    .select('id, origin, source, created_by, created_at')
    .eq('app_deployment_id', appDeploymentId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: String(row.id),
    origin: String(row.origin),
    source: String(row.source ?? 'manual'),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at: String(row.created_at),
  }))
}

export async function addOperatorAllowedOrigin(params: {
  appDeploymentId: string
  origin: string
  userId: string
}): Promise<OperatorAllowedOrigin> {
  const origin = normalizeAppAllowedOrigin(params.origin)
  const { data, error } = await supabase
    .from('app_allowed_origins')
    .upsert({
      app_deployment_id: params.appDeploymentId,
      origin,
      source: 'manual',
      created_by: params.userId,
    }, {
      onConflict: 'app_deployment_id,origin',
    })
    .select('id, origin, source, created_by, created_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('Allowed origin upsert returned no row')
  }

  return {
    id: String(data.id),
    origin: String(data.origin),
    source: String(data.source ?? 'manual'),
    created_by: typeof data.created_by === 'string' ? data.created_by : null,
    created_at: String(data.created_at),
  }
}

export async function removeOperatorAllowedOrigin(params: {
  appDeploymentId: string
  originId: string
}): Promise<void> {
  const { error } = await supabase
    .from('app_allowed_origins')
    .delete()
    .eq('id', params.originId)
    .eq('app_deployment_id', params.appDeploymentId)

  if (error) throw error
}
