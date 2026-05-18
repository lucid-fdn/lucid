import 'server-only'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

/**
 * Get the existing active Solana wallet address for an assistant.
 * Returns null if no active wallet exists.
 */
export async function getExistingAgentSolanaWallet(assistantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('agent_wallets')
    .select('address')
    .eq('assistant_id', assistantId)
    .eq('chain_type', 'solana')
    .eq('status', 'active')
    .single()

  return data?.address ?? null
}

/**
 * Get or provision a Solana wallet for a launched agent.
 * Reuses existing wallet if available, otherwise provisions via Privy.
 * Returns the Solana wallet address, or null if provisioning fails.
 */
export async function getOrProvisionAgentWallet(
  assistantId: string,
  orgId: string
): Promise<string | null> {
  // Check for existing active Solana wallet
  const existing = await getExistingAgentSolanaWallet(assistantId)
  if (existing) return existing

  // Provision new wallets via Privy
  try {
    const { enableAgentWallet } = await import('@/lib/agent-wallets')
    const result = await enableAgentWallet({ assistantId, orgId })

    if (!result.success || !result.solana) {
      ErrorService.captureException(
        new Error(result.error ?? 'Agent wallet provisioning returned no Solana address'),
        {
          severity: 'warning',
          context: { assistantId, orgId, operation: 'getOrProvisionAgentWallet' },
          tags: { layer: 'launchpad' },
        }
      )
      return null
    }

    return result.solana.address
  } catch (err) {
    ErrorService.captureException(err as Error, {
      severity: 'warning',
      context: { assistantId, orgId, operation: 'getOrProvisionAgentWallet' },
      tags: { layer: 'launchpad' },
    })
    return null
  }
}
