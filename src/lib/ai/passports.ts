/**
 * L2 Passport Service
 *
 * Thin facade over the Lucid SDK for agent passport CRUD.
 * Follows the same pattern as models.ts (SDK calls + caching + error handling).
 *
 * Usage:
 *   import { provisionAgentPassport, getAgentPassport } from '@/lib/ai/passports'
 */

import 'server-only'
import { lucidSDK, isSDKConfigured } from './sdk'
import { ErrorService, withRetry } from '@/lib/errors/error-service'
import {
  describePassportOwnerEnvNames,
  getPassportOwnerFallback,
} from '@/lib/lucid-l2/env'
import type { Passport } from 'raijin-labs-lucid-ai/models'

export type { Passport }

// ============================================================================
// CONFIG
// ============================================================================

function getPlatformPassportOwner(): string | null {
  return getPassportOwnerFallback()
}

// ============================================================================
// OWNER RESOLUTION (multi-tenant: org owner's Privy wallet)
// ============================================================================

// Singleton Privy client (avoid re-instantiation per call)
let _privyClient: InstanceType<typeof import('@privy-io/server-auth').PrivyClient> | null = null
async function getPrivyClientSingleton() {
  if (_privyClient) return _privyClient
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) return null
  const { PrivyClient } = await import('@privy-io/server-auth')
  _privyClient = new PrivyClient(appId, appSecret)
  return _privyClient
}

/**
 * Resolve the passport owner address for an org.
 *
 * Priority:
 *   1. Org owner's Privy embedded wallet (true multi-tenant ownership)
 *   2. Platform passport owner env aliases (fallback for orgs without wallets)
 */
export async function resolvePassportOwner(orgId: string): Promise<string | null> {
  try {
    const { supabase } = await import('@/lib/db/client')

    // Get org owner
    const { data: member } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    if (!member?.user_id) return getPlatformPassportOwner()

    // Get owner's Privy DID
    const { data: link } = await supabase
      .from('identity_links')
      .select('external_id')
      .eq('user_id', member.user_id)
      .eq('provider', 'privy')
      .maybeSingle()

    if (!link?.external_id) return getPlatformPassportOwner()

    // Look up wallet via Privy server SDK (singleton)
    const privy = await getPrivyClientSingleton()
    if (!privy) return getPlatformPassportOwner()
    const privyUser = await privy.getUser(link.external_id)

    // Find first linked wallet (embedded or external)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (privyUser.linkedAccounts ?? []) as any[]
    const wallets = accounts.filter(a => a.type === 'wallet') as Array<{ address?: string }>

    const walletAddress = wallets[0]?.address
    if (walletAddress) return walletAddress

    return getPlatformPassportOwner()
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { orgId },
      tags: { layer: 'ai', domain: 'passports' },
    })
    return getPlatformPassportOwner()
  }
}

// ============================================================================
// PASSPORT CRUD
// ============================================================================

/**
 * Provision an agent passport on L2 for a newly created assistant.
 *
 * - Retries up to 3x with exponential backoff (1s, 2s, 4s)
 * - Non-throwing — returns passport_id on success, null on failure
 * - Designed for non-blocking use in assistant creation flows
 */
export async function provisionAgentPassport(params: {
  name: string
  description?: string
  owner?: string
}): Promise<string | null> {
  if (!isSDKConfigured()) return null

  const owner = params.owner || getPlatformPassportOwner()
  if (!owner) {
    ErrorService.captureMessage(
      `Cannot provision passport: no owner address (set one of ${describePassportOwnerEnvNames()})`,
      {
        severity: 'warning',
        tags: { layer: 'ai', domain: 'passports' },
      },
    )
    return null
  }

  try {
    const res = await withRetry(
      () => lucidSDK.passports.create({
        type: 'agent',
        owner,
        name: params.name,
        description: params.description,
        metadata: {
          agent_config: {
            system_prompt: (params.description || params.name).slice(0, 200),
            model_passport_id: 'gpt-4o',
          },
          deployment_config: {
            target: { type: 'railway', runtime: 'lucid-saas' },
          },
        },
      }),
      { maxRetries: 3, delay: 1000, backoff: 2, context: { name: params.name, owner } },
    )
    const passportId = res.passportId || (res as Record<string, unknown>).passport_id as string

    // On-chain sync (PDA to Solana) is triggered automatically by L2's
    // attemptOnChainSync() during create — no extra call needed here.

    return passportId
  } catch (_err) {
    // withRetry already logged the final failure via ErrorService
    return null
  }
}

/**
 * Trigger on-chain sync for a passport (writes PDA to Solana / contract to ETH).
 *
 * Returns { pda, tx } on success, null on failure.
 * Called automatically after passport creation.
 */
export async function triggerOnChainSync(
  passportId: string,
): Promise<{ pda: string | null; tx: string | null } | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.passports.sync({ passportId })
    return {
      pda: res.onChainPda ?? null,
      tx: res.onChainTx ?? null,
    }
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { passportId },
      tags: { layer: 'ai', domain: 'passports' },
    })
    return null
  }
}

/**
 * Fetch a passport from L2 by ID.
 *
 * Returns null if not found, SDK not configured, or on error.
 */
export async function getAgentPassport(passportId: string): Promise<Passport | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.passports.get({ passportId }, { timeoutMs: 5_000 })
    return res.passport ?? null
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { passportId },
      tags: { layer: 'ai', domain: 'passports' },
    })
    return null
  }
}

/**
 * Ensure an assistant has a passport — idempotent.
 *
 * If passport_id is already set, returns it.
 * If not, provisions a new one and persists it to the assistant row.
 *
 * Used by:
 * - Assistant creation (fire-and-forget)
 * - Backfill cron (catch-up for assistants created while L2 was down)
 * - On-demand retry from passport API endpoint
 */
export async function ensureAssistantPassport(params: {
  assistantId: string
  existingPassportId: string | null
  name: string
  description?: string
  orgId?: string
}): Promise<string | null> {
  // Already provisioned — nothing to do
  if (params.existingPassportId) return params.existingPassportId

  // Resolve owner: org owner's wallet > platform wallet
  let owner: string | undefined
  if (params.orgId) {
    owner = (await resolvePassportOwner(params.orgId)) ?? undefined
  }

  const passportId = await provisionAgentPassport({
    name: params.name,
    description: params.description,
    owner,
  })
  if (!passportId) return null

  // Persist to assistant row — dynamic import to avoid circular deps
  try {
    const { updateAssistant } = await import('@/lib/db')
    await updateAssistant(params.assistantId, { passport_id: passportId })
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'error',
      context: { assistantId: params.assistantId, passportId },
      tags: { layer: 'ai', domain: 'passports' },
    })
    // Passport was created on L2 but DB write failed — return it anyway
    // so callers can retry the DB write or the backfill cron picks it up
  }

  return passportId
}
