/**
 * Agent Wallet Service
 *
 * Creates and manages server-owned Privy wallets for AI assistants.
 * Wallets are owned by the app's authorization key (fully server-controlled).
 */

import 'server-only'
import { PrivyClient } from '@privy-io/server-auth'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

// Re-export pure helpers so consumers can import everything from one place
export {
  TRADING_TOOLS_DEFI_ONLY,
  TRADING_TOOLS_WITH_TRANSFER,
  TRADING_CAPABILITIES_DEFI_ONLY,
  TRADING_CAPABILITIES_WITH_TRANSFER,
  buildDefaultTradingPolicy,
  buildWalletPromptBlock,
} from './helpers'
export type {
  AgentWallet,
  EnableWalletParams,
  EnableWalletResult,
} from './helpers'

import {
  TRADING_CAPABILITIES_DEFI_ONLY,
  TRADING_CAPABILITIES_WITH_TRANSFER,
  buildDefaultTradingPolicy,
} from './helpers'
import type { EnableWalletParams, EnableWalletResult, AgentWallet } from './helpers'

const AGENT_WALLET_SELECT =
  'id, assistant_id, org_id, chain_type, privy_wallet_id, address, privy_policy_id, withdrawal_address, status, created_at, updated_at' as const

// ============================================================================
// Clients
// ============================================================================

const getSupabase = () => supabase

let _privy: PrivyClient | null = null
function getPrivy(): PrivyClient {
  if (!_privy) {
    const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY
    _privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!,
      authorizationPrivateKey
        ? { walletApi: { authorizationPrivateKey } }
        : undefined
    )
  }
  return _privy
}

// ============================================================================
// Enable Wallet
// ============================================================================

export async function enableAgentWallet(
  params: EnableWalletParams
): Promise<EnableWalletResult> {
  const { assistantId, orgId, withdrawalAddressEvm, withdrawalAddressSolana } =
    params
  const supabase = getSupabase()
  const privy = getPrivy()

  try {
    // 1. Set wallet_enabled = true
    await supabase
      .from('ai_assistants')
      .update({ wallet_enabled: true })
      .eq('id', assistantId)

    // 2. Insert placeholder rows with status='creating'
    const evmId = crypto.randomUUID()
    const solId = crypto.randomUUID()

    await supabase.from('agent_wallets').upsert(
      [
        {
          id: evmId,
          assistant_id: assistantId,
          org_id: orgId,
          chain_type: 'ethereum',
          privy_wallet_id: `pending-${evmId}`,
          address: `pending-${evmId}`,
          withdrawal_address: withdrawalAddressEvm || null,
          status: 'creating',
        },
        {
          id: solId,
          assistant_id: assistantId,
          org_id: orgId,
          chain_type: 'solana',
          privy_wallet_id: `pending-${solId}`,
          address: `pending-${solId}`,
          withdrawal_address: withdrawalAddressSolana || null,
          status: 'creating',
        },
      ],
      { onConflict: 'assistant_id,chain_type' }
    )

    // 3. Create Privy policy with router address allowlist (EVM only)
    //    This is a Privy-level guardrail — even if our code has a bug,
    //    Privy refuses to sign transactions to unapproved addresses.
    let evmPolicyId: string | null = null
    try {
      const { data: routers } = await supabase
        .from('known_protocol_routers')
        .select('router_address')
        .eq('is_active', true)

      const routerAddresses = [...new Set(
        (routers || []).map((r: { router_address: string }) => r.router_address)
      )]

      if (routerAddresses.length > 0) {
        const policyRules = routerAddresses.map((addr: string, i: number) => ({
          name: `Allow router ${i + 1}`,
          method: 'eth_sendTransaction',
          action: 'ALLOW',
          conditions: [{
            field_source: 'ethereum_transaction',
            field: 'to',
            operator: 'eq',
            value: addr,
          }],
        }))

        // Also allow withdrawal address if provided
        if (withdrawalAddressEvm) {
          policyRules.push({
            name: 'Allow withdrawal address',
            method: 'eth_sendTransaction',
            action: 'ALLOW',
            conditions: [{
              field_source: 'ethereum_transaction',
              field: 'to',
              operator: 'eq',
              value: withdrawalAddressEvm,
            }],
          })
        }

        const privyAny = privy as unknown as {
          walletApi: {
            createPolicy: (args: Record<string, unknown>) => Promise<{ id: string }>
          }
        }
        const policy = await privyAny.walletApi.createPolicy({
          version: '1.0',
          name: `agent-wallet-${assistantId.slice(0, 8)}`,
          chainType: 'ethereum',
          rules: policyRules,
        })
        evmPolicyId = policy.id
      }
    } catch (policyErr) {
      // Non-fatal — wallet still works, just without Privy-level HSM policy.
      // This degrades security: only the execute API allowlist protects against unauthorized transfers.
      ErrorService.captureException(policyErr, {
        severity: 'warning',
        context: { operation: 'enableAgentWallet:createPolicy', assistantId },
        tags: { layer: 'agent-wallets', security: 'degraded' },
      })
    }

    // 4. Create Privy wallets (with policy if available)
    const [evmWallet, solWallet] = await Promise.all([
      privy.walletApi.createWallet({
        chainType: 'ethereum',
        ...(evmPolicyId ? { policyIds: [evmPolicyId] } : {}),
      }),
      privy.walletApi.createWallet({ chainType: 'solana' }),
    ])

    // 5. Update rows with real Privy data + policy ID
    await Promise.all([
      supabase
        .from('agent_wallets')
        .update({
          privy_wallet_id: evmWallet.id,
          address: evmWallet.address,
          privy_policy_id: evmPolicyId,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', evmId),
      supabase
        .from('agent_wallets')
        .update({
          privy_wallet_id: solWallet.id,
          address: solWallet.address,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', solId),
    ])

    // 6. Create default trading policy (upsert in case one already exists)
    const defaultPolicy = buildDefaultTradingPolicy(assistantId)
    await supabase.from('trading_policies').upsert(defaultPolicy, {
      onConflict: 'assistant_id',
    })

    // 7. Set capabilities on policy_config
    await supabase
      .from('ai_assistants')
      .update({
        policy_config: { capabilities: TRADING_CAPABILITIES_DEFI_ONLY },
      })
      .eq('id', assistantId)

    return {
      success: true,
      evm: { address: evmWallet.address, walletId: evmWallet.id },
      solana: { address: solWallet.address, walletId: solWallet.id },
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'enableAgentWallet', assistantId },
      tags: { layer: 'agent-wallets' },
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create agent wallets',
    }
  }
}

// ============================================================================
// Disable Wallet
// ============================================================================

export async function disableAgentWallet(
  assistantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  try {
    await supabase
      .from('ai_assistants')
      .update({ wallet_enabled: false })
      .eq('id', assistantId)

    await supabase
      .from('agent_wallets')
      .update({ status: 'frozen', updated_at: new Date().toISOString() })
      .eq('assistant_id', assistantId)

    // Remove trading capabilities from policy_config
    const { data: assistant } = await supabase
      .from('ai_assistants')
      .select('policy_config')
      .eq('id', assistantId)
      .single()

    const config = (assistant?.policy_config || {}) as Record<string, unknown>
    const existing = (config.capabilities as string[]) || []
    const remaining = existing.filter(
      (c) => !TRADING_CAPABILITIES_WITH_TRANSFER.includes(c)
    )

    await supabase
      .from('ai_assistants')
      .update({ policy_config: { ...config, capabilities: remaining } })
      .eq('id', assistantId)

    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'disableAgentWallet', assistantId },
      tags: { layer: 'agent-wallets' },
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to disable agent wallets',
    }
  }
}

// ============================================================================
// Update Privy Policy (e.g. when withdrawal address changes)
// ============================================================================

/**
 * Rebuild the Privy allowlist policy for an agent wallet to include
 * the current withdrawal address. Called when withdrawal address is updated.
 */
export async function updateAgentWalletPolicy(
  assistantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()
  const privy = getPrivy()

  try {
    // Get the active EVM wallet (policies are EVM-only for now)
    const { data: evmWallet } = await supabase
      .from('agent_wallets')
      .select('privy_wallet_id, privy_policy_id, withdrawal_address')
      .eq('assistant_id', assistantId)
      .eq('chain_type', 'ethereum')
      .eq('status', 'active')
      .single()

    if (!evmWallet?.privy_wallet_id) {
      return { success: false, error: 'No active EVM wallet' }
    }

    // Fetch current router addresses
    const { data: routers } = await supabase
      .from('known_protocol_routers')
      .select('router_address')
      .eq('is_active', true)

    const routerAddresses = [...new Set(
      (routers || []).map((r: { router_address: string }) => r.router_address)
    )]

    if (routerAddresses.length === 0) {
      return { success: true } // No routers = no policy to create
    }

    const policyRules = routerAddresses.map((addr: string, i: number) => ({
      name: `Allow router ${i + 1}`,
      method: 'eth_sendTransaction',
      action: 'ALLOW',
      conditions: [{
        field_source: 'ethereum_transaction',
        field: 'to',
        operator: 'eq',
        value: addr,
      }],
    }))

    // Include withdrawal address in allowlist
    if (evmWallet.withdrawal_address) {
      policyRules.push({
        name: 'Allow withdrawal address',
        method: 'eth_sendTransaction',
        action: 'ALLOW',
        conditions: [{
          field_source: 'ethereum_transaction',
          field: 'to',
          operator: 'eq',
          value: evmWallet.withdrawal_address,
        }],
      })
    }

    // Delete old policy if exists, then create new one
    const privyAny = privy as unknown as {
      walletApi: {
        createPolicy: (args: Record<string, unknown>) => Promise<{ id: string }>
        deletePolicy?: (policyId: string) => Promise<void>
      }
    }

    if (evmWallet.privy_policy_id) {
      try {
        await privyAny.walletApi.deletePolicy?.(evmWallet.privy_policy_id)
      } catch {
        // Old policy deletion is best-effort
      }
    }

    const policy = await privyAny.walletApi.createPolicy({
      version: '1.0',
      name: `agent-wallet-${assistantId.slice(0, 8)}`,
      chainType: 'ethereum',
      rules: policyRules,
    })

    // Update stored policy ID
    await supabase
      .from('agent_wallets')
      .update({
        privy_policy_id: policy.id,
        updated_at: new Date().toISOString(),
      })
      .eq('assistant_id', assistantId)
      .eq('chain_type', 'ethereum')
      .eq('status', 'active')

    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'updateAgentWalletPolicy', assistantId },
      tags: { layer: 'agent-wallets' },
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Policy update failed',
    }
  }
}

// ============================================================================
// Get Agent Wallets
// ============================================================================

export async function getAgentWallets(
  assistantId: string
): Promise<AgentWallet[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_wallets')
    .select(AGENT_WALLET_SELECT)
    .eq('assistant_id', assistantId)
    .order('chain_type')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'getAgentWallets', assistantId },
      tags: { layer: 'agent-wallets' },
    })
    return []
  }

  return data || []
}
