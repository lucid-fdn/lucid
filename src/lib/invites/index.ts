/**
 * Centralized Invite System
 * Industry-standard, scalable invite link management
 */

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
    )
  }
  return _supabase
}

export interface InviteToken {
  id: string
  organization_id: string
  token: string
  created_by: string
  enabled: boolean
  role?: string  // Role for new members joining via this invite
  expires_at: string | null
  used_count: number
  max_uses: number | null
  created_at: string
  updated_at: string
}

const INVITE_TOKEN_SELECT =
  'id, organization_id, token, created_by, enabled, role, expires_at, used_count, max_uses, created_at, updated_at' as const

/**
 * Get active invite token for organization
 */
export async function getOrgInviteToken(orgId: string): Promise<InviteToken | null> {
  const { data, error } = await getSupabase()
    .from('invite_tokens')
    .select(INVITE_TOKEN_SELECT)
    .eq('organization_id', orgId)
    .eq('enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data
}

/**
 * Generate new invite token
 * Disables previous tokens
 */
export async function generateInviteToken(
  orgId: string,
  createdBy: string
): Promise<InviteToken> {
  // Disable all existing tokens
  await getSupabase()
    .from('invite_tokens')
    .update({ enabled: false })
    .eq('organization_id', orgId)
  
  // Generate new token
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(16)))
    .toString('hex')
  
  const { data, error } = await getSupabase()
    .from('invite_tokens')
    .insert({
      organization_id: orgId,
      token,
      created_by: createdBy,
      enabled: true
    })
    .select()
    .single()
  
  if (error || !data) {
    throw new Error('Failed to generate invite token')
  }
  
  return data
}

/**
 * Toggle invite token enabled status
 */
export async function toggleInviteToken(
  orgId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_tokens')
    .update({ enabled })
    .eq('organization_id', orgId)
    .eq('enabled', !enabled) // Only update if current state is opposite
  
  if (error) {
    throw new Error('Failed to toggle invite token')
  }
  
}

/**
 * Validate and use invite token
 * Returns organization if valid
 */
export async function validateInviteToken(token: string): Promise<{
  valid: boolean
  organization?: {
    id: string
    name: string
    slug: string
  }
  error?: string
}> {
  // Get token
  const { data: tokenData, error: tokenError } = await getSupabase()
    .from('invite_tokens')
    .select(`
      *,
      organization:organizations!invite_tokens_organization_id_fkey(
        id,
        name,
        slug
      )
    `)
    .eq('token', token)
    .single()
  
  if (tokenError || !tokenData) {
    return { valid: false, error: 'Invalid invite link' }
  }
  
  // Check if enabled
  if (!tokenData.enabled) {
    return { valid: false, error: 'This invite link has been disabled' }
  }
  
  // Check expiration
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return { valid: false, error: 'This invite link has expired' }
  }
  
  // Check max uses
  if (tokenData.max_uses && tokenData.used_count >= tokenData.max_uses) {
    return { valid: false, error: 'This invite link has reached its usage limit' }
  }
  
  return {
    valid: true,
    organization: (tokenData as unknown as Record<string, { id: string; name: string; slug: string }>).organization
  }
}

/**
 * Accept invite - Add user to organization
 */
export async function acceptInvite(
  token: string,
  userId: string
): Promise<{
  success: boolean
  organization?: {
    id: string
    name: string
    slug: string
  }
  error?: string
}> {
  // Get token data
  const { data: tokenData, error: tokenError } = await getSupabase()
    .from('invite_tokens')
    .select(`
      *,
      organization:organizations!invite_tokens_organization_id_fkey(
        id,
        name,
        slug
      )
    `)
    .eq('token', token)
    .single()
  
  if (tokenError || !tokenData) {
    return { success: false, error: 'Invalid invite link' }
  }
  
  // Validate
  const validation = await validateInviteToken(token)
  if (!validation.valid || !validation.organization) {
    return { success: false, error: validation.error }
  }
  
  const org = validation.organization
  
  // Check if already a member
  const { data: existing } = await getSupabase()
    .from('organization_members')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .single()

  if (existing) {
    return {
      success: true,
      organization: org
    }
  }

  // Enforce member count limit via entitlement system
  const { count: memberCount } = await getSupabase()
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)

  const { evaluateEntitlement } = await import('@/lib/entitlements')
  const entitlement = await evaluateEntitlement({ orgId: org.id, action: 'invite_member', currentUsage: memberCount || 0 })
  if (!entitlement.allowed) {
    const max = entitlement.deny?.entitlement.max
    return { success: false, error: `Team member limit reached (${memberCount}/${max ?? '?'}). Ask the workspace owner to upgrade their plan.` }
  }

  // Add as member with role from invite token (or default to 'member')
  const { error: insertError } = await getSupabase()
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: tokenData.role || 'member'
    })
  
  if (insertError) {
    console.error('[invites] Failed to add member:', insertError)
    return { success: false, error: 'Failed to join workspace' }
  }
  
  // Increment used count
  await getSupabase()
    .from('invite_tokens')
    .update({ used_count: (tokenData as unknown as Record<string, number>).used_count + 1 })
    .eq('token', token)
  
  return {
    success: true,
    organization: org
  }
}
