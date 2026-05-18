/**
 * Runtime Phone-Home Auth
 *
 * Validates runtime API key from Authorization: Bearer <key> header.
 * Uses Node crypto scrypt for key hashing (no bcrypt dependency needed).
 * Used by all /api/runtimes/* phone-home endpoints.
 *
 * Auth flow: The runtime ID is embedded in the API key prefix (first 8 chars of
 * the runtime UUID), so we can look up the exact runtime instead of scanning all.
 * Key format: `{runtimeIdPrefix}{randomBytes}` — 8 hex prefix + 56 hex random.
 */

import 'server-only'
import crypto from 'crypto'
import { supabase } from '@/lib/db/client'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'
import { resolveDedicatedTransportMode } from '@/lib/runtimes/dedicated-transport'

export interface AuthenticatedRuntime {
  id: string
  orgId: string
  generation: number
  status: string
  engine?: 'openclaw' | 'hermes'
  runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
  runtimeProtocol?: 'lucid-runtime-v1' | 'lucid-runtime-v2' | null
  dedicatedTransportMode?: DedicatedTransportMode | null
}

/**
 * Generate a runtime API key with embedded runtime ID prefix for O(1) lookup.
 * Format: first 8 chars of runtime UUID (no dashes) + 56 random hex chars = 64 chars total.
 */
export function generateApiKey(runtimeId: string): string {
  const prefix = runtimeId.replace(/-/g, '').slice(0, 8)
  const random = crypto.randomBytes(28).toString('hex') // 56 hex chars
  return `${prefix}${random}`
}

/** Extract the runtime ID prefix from an API key (first 8 hex chars) */
function extractPrefix(apiKey: string): string {
  return apiKey.slice(0, 8)
}

/** Hash an API key for storage (salt + scrypt) */
export function hashApiKey(apiKey: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(apiKey, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

/** Verify an API key against a stored hash (timing-safe) */
function verifyApiKey(apiKey: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const derivedHash = crypto.scryptSync(apiKey, salt, 64).toString('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'))
  } catch {
    return false // Buffer length mismatch
  }
}

/**
 * Authenticate a runtime from its API key.
 * Uses embedded prefix for O(1) lookup instead of scanning all runtimes.
 */
export async function authenticateRuntime(
  authHeader: string | null
): Promise<AuthenticatedRuntime | null> {
  if (!authHeader?.startsWith('Bearer ')) return null

  const apiKey = authHeader.slice(7)
  if (!apiKey || apiKey.length < 16) return null

  const prefix = extractPrefix(apiKey)

  // Look up runtimes whose ID starts with this prefix (typically 1 match).
  // UUID columns don't support LIKE — use range query on the first UUID segment instead.
  // API key prefix = first 8 hex chars of UUID (no dashes) = first UUID segment.
  const lowerBound = `${prefix}-0000-0000-0000-000000000000`
  const upperBound = `${prefix}-ffff-ffff-ffff-ffffffffffff`
  const { data: runtimes, error } = await supabase
    .from('dedicated_runtimes')
    .select('id, org_id, generation, status, api_key_hash, engine, runtime_flavor, runtime_protocol, channel_mode, channel_ownership, dedicated_transport_mode')
    .neq('status', 'revoked')
    .gte('id', lowerBound)
    .lte('id', upperBound)

  if (error || !runtimes?.length) return null

  // Verify against the matching runtimes (typically 1)
  for (const rt of runtimes) {
    if (verifyApiKey(apiKey, rt.api_key_hash)) {
      return {
        id: rt.id,
        orgId: rt.org_id,
        generation: rt.generation,
        status: rt.status,
        engine: (rt.engine as 'openclaw' | 'hermes' | undefined) ?? undefined,
        runtimeFlavor:
          (rt.runtime_flavor as 'shared' | 'c1_managed' | 'c2a_autonomous' | null | undefined) ?? null,
        runtimeProtocol:
          (rt.runtime_protocol as 'lucid-runtime-v1' | 'lucid-runtime-v2' | null | undefined) ?? null,
        dedicatedTransportMode: resolveDedicatedTransportMode({
          dedicatedTransportMode:
            (rt.dedicated_transport_mode as DedicatedTransportMode | null | undefined) ?? null,
          channelMode: (rt.channel_mode as 'relay' | 'native' | null | undefined) ?? null,
          channelOwnership:
            (rt.channel_ownership as 'lucid_relay' | 'runtime_native' | null | undefined) ?? null,
        }),
      }
    }
  }

  return null
}
