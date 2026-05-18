import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  encryptProviderKey,
  decryptProviderKey,
  generateKeyPreview,
  validateProviderKeyFormat,
} from '@/lib/crypto/encryption'
import { ErrorService } from '@/lib/errors/error-service'
import type { ErrorContext } from '@/lib/errors/types'

// ============================================================================
// TYPES
// ============================================================================

export const SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'groq',
  'cohere',
  'google',
  'mistral',
  'perplexity',
  'deepseek',
  'together',
  'fireworks',
  'openrouter',
] as const

export type ProviderType = (typeof SUPPORTED_PROVIDERS)[number]

export interface ProviderKey {
  id: string
  org_id: string
  provider: ProviderType
  key_name: string | null
  key_preview: string
  is_active: boolean
  last_verified_at: string | null
  last_used_at: string | null
  verification_status: 'pending' | 'valid' | 'invalid' | 'expired'
  created_by: string | null
  created_at: string
  updated_at: string
}

// Fields safe to return to client (never includes encrypted_key)
const SAFE_SELECT =
  'id, org_id, provider, key_name, key_preview, is_active, last_verified_at, last_used_at, verification_status, created_by, created_at, updated_at'

function getTrustGateAdminConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = (
    process.env.TRUSTGATE_ADMIN_BASE_URL
    ?? process.env.TRUSTGATE_BASE_URL
    ?? ''
  ).trim().replace(/\/+$/, '')
  const apiKey = (
    process.env.TRUSTGATE_ADMIN_API_KEY
    ?? process.env.TRUSTGATE_API_KEY
    ?? ''
  ).trim()

  if (!baseUrl || !apiKey) {
    throw new Error('TrustGate provider key sync is not configured')
  }

  return { baseUrl, apiKey }
}

async function syncProviderKeyToTrustGate(params: {
  orgId: string
  providerKeyId: string
  provider: ProviderType
  apiKey: string
  active: boolean
  keyName?: string | null
}): Promise<void> {
  const { baseUrl, apiKey } = getTrustGateAdminConfig()
  const response = await fetch(`${baseUrl}/v1/admin/provider-keys`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      org_id: params.orgId,
      provider_key_id: params.providerKeyId,
      provider: params.provider,
      api_key: params.apiKey,
      active: params.active,
      key_name: params.keyName ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(`TrustGate provider key sync failed (${response.status})`)
  }
}

async function disableProviderKeyInTrustGate(params: {
  orgId: string
  providerKeyId: string
}): Promise<void> {
  const { baseUrl, apiKey } = getTrustGateAdminConfig()
  const response = await fetch(`${baseUrl}/v1/admin/provider-keys/disable`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      org_id: params.orgId,
      provider_key_id: params.providerKeyId,
    }),
  })

  if (!response.ok) {
    throw new Error(`TrustGate provider key disable failed (${response.status})`)
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all provider keys for an org (safe fields only, no secrets).
 */
export const getProviderKeys = cache(
  async (orgId: string): Promise<ProviderKey[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('org_provider_keys')
      .select(SAFE_SELECT)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      ErrorService.captureException(error, {
        context: { operation: 'getProviderKeys', table: 'org_provider_keys' } as ErrorContext,
      })
      return []
    }

    return (data ?? []) as ProviderKey[]
  }
)

/**
 * Get active provider keys for an org (for display purposes).
 */
export const getActiveProviderKeys = cache(
  async (orgId: string): Promise<ProviderKey[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('org_provider_keys')
      .select(SAFE_SELECT)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('provider', { ascending: true })

    if (error) {
      ErrorService.captureException(error, {
        context: { operation: 'getActiveProviderKeys', table: 'org_provider_keys' } as ErrorContext,
      })
      return []
    }

    return (data ?? []) as ProviderKey[]
  }
)

/**
 * Check which providers an org has active keys for.
 */
export const getConfiguredProviders = cache(
  async (orgId: string): Promise<ProviderType[]> => {
    const keys = await getActiveProviderKeys(orgId)
    return keys.map((k) => k.provider as ProviderType)
  }
)

/**
 * Decrypt a provider key (server-only, never expose to client).
 * Used when creating BYOK gateway keys to pass to lucid-plateform-core.
 */
export async function getDecryptedProviderKey(
  orgId: string,
  provider: ProviderType
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_provider_keys')
    .select('encrypted_key')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single()

  if (error || !data) return null

  try {
    return decryptProviderKey(data.encrypted_key)
  } catch {
    ErrorService.captureException(new Error('Failed to decrypt provider key'), {
      context: { operation: 'getDecryptedProviderKey', table: 'org_provider_keys' } as ErrorContext,
    })
    return null
  }
}

/**
 * Get all active decrypted provider keys for an org (for BYOK gateway key creation).
 * Returns a map of provider → decrypted key.
 */
export async function getDecryptedProviderKeysMap(
  orgId: string
): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_provider_keys')
    .select('provider, encrypted_key')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (error || !data) return {}

  const result: Record<string, string> = {}
  for (const row of data) {
    try {
      result[row.provider] = decryptProviderKey(row.encrypted_key)
    } catch {
      // Skip keys that fail to decrypt
    }
  }
  return result
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Add a new provider key (encrypts the key before storing).
 */
export async function addProviderKey(params: {
  orgId: string
  provider: ProviderType
  key: string
  keyName?: string
  userId: string
}): Promise<ProviderKey> {
  const { orgId, provider, key, keyName, userId } = params

  // Validate format
  const validation = validateProviderKeyFormat(provider, key)
  if (!validation.valid) {
    throw new Error(validation.error ?? `Invalid ${provider} API key`)
  }

  // Encrypt
  const encryptedKey = encryptProviderKey(key)
  const keyPreview = generateKeyPreview(key)

  const supabase = await createClient()

  const { data: previouslyActive } = await supabase
    .from('org_provider_keys')
    .select('id')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_active', true)

  // Deactivate any existing active key for this provider (replace strategy)
  await supabase
    .from('org_provider_keys')
    .update({ is_active: false })
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_active', true)

  // Insert new key
  const { data, error } = await supabase
    .from('org_provider_keys')
    .insert({
      org_id: orgId,
      provider,
      encrypted_key: encryptedKey,
      key_name: keyName ?? `${provider} key`,
      key_preview: keyPreview,
      is_active: true,
      verification_status: 'pending',
      created_by: userId,
    })
    .select(SAFE_SELECT)
    .single()

  if (error) {
    throw new Error(`Failed to add ${provider} key: ${error.message}`)
  }

  try {
    await syncProviderKeyToTrustGate({
      orgId,
      providerKeyId: data.id,
      provider,
      apiKey: key,
      active: true,
      keyName,
    })
  } catch (syncError) {
    await supabase.from('org_provider_keys').delete().eq('id', data.id)
    const previousIds = (previouslyActive ?? []).map((row) => row.id)
    if (previousIds.length > 0) {
      await supabase
        .from('org_provider_keys')
        .update({ is_active: true })
        .in('id', previousIds)
    }
    throw syncError
  }

  // Audit log
  await logProviderKeyAction({
    orgId,
    providerKeyId: data.id,
    action: 'created',
    actorId: userId,
    metadata: { provider, key_name: keyName },
  })

  return data as ProviderKey
}

/**
 * Delete a provider key.
 */
export async function deleteProviderKey(params: {
  id: string
  orgId: string
  userId: string
}): Promise<void> {
  const { id, orgId, userId } = params

  const supabase = await createClient()
  await disableProviderKeyInTrustGate({ orgId, providerKeyId: id })

  const { error } = await supabase
    .from('org_provider_keys')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to delete provider key: ${error.message}`)
  }

  await logProviderKeyAction({
    orgId,
    providerKeyId: id,
    action: 'deleted',
    actorId: userId,
  })
}

/**
 * Toggle a provider key active/inactive.
 */
export async function toggleProviderKey(params: {
  id: string
  orgId: string
  isActive: boolean
  userId: string
}): Promise<void> {
  const { id, orgId, isActive, userId } = params

  const supabase = await createClient()
  if (isActive) {
    const { data: keyRow, error: keyError } = await supabase
      .from('org_provider_keys')
      .select('provider, encrypted_key, key_name')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (keyError || !keyRow) {
      throw new Error('Provider key not found')
    }

    await syncProviderKeyToTrustGate({
      orgId,
      providerKeyId: id,
      provider: keyRow.provider as ProviderType,
      apiKey: decryptProviderKey(keyRow.encrypted_key),
      active: true,
      keyName: keyRow.key_name,
    })
  } else {
    await disableProviderKeyInTrustGate({ orgId, providerKeyId: id })
  }

  const { error } = await supabase
    .from('org_provider_keys')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to update provider key: ${error.message}`)
  }

  await logProviderKeyAction({
    orgId,
    providerKeyId: id,
    action: isActive ? 'activated' : 'deactivated',
    actorId: userId,
  })
}

/**
 * Update verification status after testing a key.
 */
export async function updateVerificationStatus(params: {
  id: string
  orgId: string
  status: 'valid' | 'invalid' | 'expired'
}): Promise<void> {
  const { id, orgId, status } = params

  const supabase = await createClient()
  const { error } = await supabase
    .from('org_provider_keys')
    .update({
      verification_status: status,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to update verification status: ${error.message}`)
  }
}

// ============================================================================
// AUDIT
// ============================================================================

async function logProviderKeyAction(params: {
  orgId: string
  providerKeyId: string
  action: string
  actorId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('org_provider_key_audit').insert({
      org_id: params.orgId,
      provider_key_id: params.providerKeyId,
      action: params.action,
      actor_id: params.actorId,
      metadata: params.metadata ?? {},
    })
  } catch {
    // Audit logging should never break the main flow
  }
}
