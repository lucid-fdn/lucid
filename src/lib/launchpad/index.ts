/**
 * Launchpad Orchestration
 *
 * High-level operations that compose DB + Genesis + Streamflow + Pricing.
 * All Solana operations go through SolanaService for retry, confirm, and failover.
 */

import 'server-only'
import {
  createLaunchedAgent,
  updateLaunchedAgent,
  getLaunchedAgentBySlug,
  getLaunchedAgentById,
  createStakingPool,
} from '@/lib/db/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { maskIdentifier, maskWalletAddress } from '@/lib/logging/safe-log'
import type { CreateLaunchedAgentInput } from '../../../contracts/launchpad'

// Keep this module focused on DB orchestration. Routes that need pricing,
// Genesis, Streamflow, wallet, or Solana helpers should import those concrete
// modules directly so Next does not trace every launchpad dependency together.

/**
 * Launch an agent — creates the launched_agents record.
 * If no assistant_id is provided, auto-creates a minimal ai_assistant.
 * If no org_id is provided, auto-provisions a personal org.
 * Token creation (Genesis) and staking pool (Streamflow) are separate steps
 * triggered after the record exists via activateAgent().
 */
export async function launchAgent(
  input: CreateLaunchedAgentInput & { creator_id?: string }
) {
  // Check slug uniqueness
  const existing = await getLaunchedAgentBySlug(input.slug)
  if (existing) {
    return { error: 'Slug already taken', agent: null }
  }

  // Auto-provision org if not provided
  let orgId = input.org_id
  if (!orgId && input.creator_id) {
    const { ensurePersonalOrg } = await import('./ensure-org')
    orgId = await ensurePersonalOrg(input.creator_id)
  }
  if (!orgId) {
    return { error: 'Organization is required', agent: null }
  }

  // Auto-create ai_assistant if not provided
  let assistantId = input.assistant_id
  if (!assistantId) {
    const { supabase } = await import('@/lib/db/client')

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single()

    if (!project) {
      return { error: 'No project found for organization', agent: null }
    }

    const { data: env } = await supabase
      .from('environments')
      .select('id')
      .eq('project_id', project.id)
      .limit(1)
      .single()

    if (!env) {
      return { error: 'No environment found for project', agent: null }
    }

    const { data: assistant, error: assistantErr } = await supabase
      .from('ai_assistants')
      .insert({
        org_id: orgId,
        project_id: project.id,
        env_id: env.id,
        name: input.display_name,
        description: input.description || null,
        system_prompt: `You are ${input.display_name}, an AI agent on Lucid Launch.`,
      })
      .select('id')
      .single()

    if (assistantErr || !assistant) {
      return { error: `Failed to create assistant: ${assistantErr?.message ?? 'unknown'}`, agent: null }
    }

    assistantId = assistant.id
  }

  // Auto-provision L2 passport (non-blocking — launch proceeds without it)
  if (assistantId) {
    const capturedId = assistantId
    import('@/lib/ai/passports').then(({ ensureAssistantPassport }) =>
      ensureAssistantPassport({
        assistantId: capturedId,
        existingPassportId: null,
        name: input.display_name,
        description: input.description,
      })
    ).catch(() => { /* non-fatal — backfill cron will retry */ })
  }

  // Auto-provision agent wallet (non-blocking — launch proceeds even if this fails)
  let agentWalletAddress: string | null = null
  if (assistantId) {
    try {
      const { getOrProvisionAgentWallet } = await import('./wallet-helpers')
      agentWalletAddress = await getOrProvisionAgentWallet(assistantId, orgId)
    } catch {
      // Non-fatal — agent launches without wallet
    }
  }

  const agent = await createLaunchedAgent({
    ...input,
    org_id: orgId,
    assistant_id: assistantId,
    ...(agentWalletAddress && { agent_wallet_address: agentWalletAddress }),
  })
  if (!agent) {
    return { error: 'Failed to create launched agent', agent: null }
  }

  return { error: null, agent }
}

/**
 * Transition agent status with validation.
 */
export async function transitionAgentStatus(
  agentId: string,
  newStatus: 'launching' | 'trading' | 'sunset' | 'archived'
) {
  const agent = await getLaunchedAgentById(agentId)
  if (!agent) return { error: 'Agent not found' }

  const validTransitions: Record<string, string[]> = {
    draft: ['launching'],
    launching: ['trading', 'archived'],
    trading: ['sunset'],
    sunset: ['archived'],
  }

  const allowed = validTransitions[agent.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot transition from ${agent.status} to ${newStatus}` }
  }

  const extra: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'trading' && !agent.launched_at) {
    extra.launched_at = new Date().toISOString()
  }

  const updated = await updateLaunchedAgent(agentId, extra)
  return updated ? { error: null } : { error: 'Update failed' }
}

/**
 * Full activation flow: draft → launching → mint token → create pool → trading.
 *
 * Gracefully degrades if Solana keys aren't configured:
 * - No authority key → skips Genesis mint + Streamflow pool, still transitions to trading
 * - Genesis fails → logs warning, still transitions to trading (no token)
 * - Streamflow fails → logs warning, still transitions to trading (no staking)
 *
 * On successful token mint, auto-registers with Helius webhook for trade monitoring.
 */
export async function activateAgent(agentId: string): Promise<{
  error: string | null
  tokenMint?: string
  stakePoolId?: string
}> {
  const agent = await getLaunchedAgentById(agentId)
  if (!agent) return { error: 'Agent not found' }
  if (agent.status !== 'draft') return { error: `Agent is already ${agent.status}` }

  // Ensure agent has a wallet (provision if missing)
  if (!agent.agent_wallet_address) {
    try {
      const { getOrProvisionAgentWallet } = await import('./wallet-helpers')
      const walletAddr = await getOrProvisionAgentWallet(agent.assistant_id, agent.org_id)
      if (walletAddr) {
        await updateLaunchedAgent(agentId, { agent_wallet_address: walletAddr })
      }
    } catch {
      // Non-fatal
    }
  }

  // 1. Transition to launching
  const t1 = await transitionAgentStatus(agentId, 'launching')
  if (t1.error) return { error: t1.error }

  let tokenMint: string | null = null
  let stakePoolId: string | null = null
  const { isConfigured } = await import('./solana-service')
  const solanaReady = isConfigured()

  // 2. Attempt Genesis token minting (requires authority + feature flag)
  if (solanaReady && FEATURES.agentTokenization) {
    try {
      const { buildCreateLaunchInput, executeFullLaunch, extractTokenMint } = await import('./genesis')
      const launchInput = buildCreateLaunchInput({
        creatorWallet: agent.creator_wallet,
        token: {
          name: agent.display_name,
          symbol: agent.slug.replace(/-/g, '').toUpperCase().slice(0, 6),
          image: agent.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${agent.slug}`,
          description: agent.description || undefined,
        },
        launchpool: {
          tokenAllocation: Math.floor((agent.token_supply ?? 1_000_000_000) * 0.5),
          depositStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          raiseGoal: 10,
          raydiumLiquidityBps: 5000,
          fundsRecipient: agent.creator_wallet,
        },
      })

      const result = await executeFullLaunch(launchInput)
      tokenMint = extractTokenMint(result)

      if (tokenMint) {
        await updateLaunchedAgent(agentId, { token_mint: tokenMint })
        console.log('[launchpad] Minted token for agent', {
          tokenMint: maskWalletAddress(tokenMint),
          agentId: maskIdentifier(agentId),
        })

        // Auto-register token with Helius webhook for trade monitoring
        const { addMintToHeliusWebhook } = await import('./solana-service')
        addMintToHeliusWebhook(tokenMint).catch(() => {
          // Non-blocking — trade monitoring can be added later
        })
      }
    } catch (err) {
      ErrorService.captureException(err as Error, {
        severity: 'warning',
        context: { agentId, step: 'genesis-mint' },
        tags: { layer: 'launchpad' },
      })
      console.error(`[launchpad] Genesis minting failed for ${agentId}:`, (err as Error).message)
    }
  }

  // 3. Attempt Streamflow staking pool (only if token was minted)
  if (tokenMint && solanaReady && FEATURES.agentStaking) {
    try {
      const { createAgentStakePool } = await import('./streamflow')
      const poolResult = await createAgentStakePool({ tokenMint })
      stakePoolId = poolResult.stakePoolId

      await createStakingPool(agentId, stakePoolId)
      console.log(`[launchpad] Created staking pool ${stakePoolId} for agent ${agentId}`)
    } catch (err) {
      ErrorService.captureException(err as Error, {
        severity: 'warning',
        context: { agentId, step: 'streamflow-pool' },
        tags: { layer: 'launchpad' },
      })
      console.error(`[launchpad] Staking pool failed for ${agentId}:`, (err as Error).message)
    }
  }

  // 4. Transition to trading
  const t2 = await transitionAgentStatus(agentId, 'trading')
  if (t2.error) return { error: t2.error }

  return {
    error: null,
    tokenMint: tokenMint ?? undefined,
    stakePoolId: stakePoolId ?? undefined,
  }
}
