/**
 * L2 Receipt & Epoch Service
 *
 * Thin facade over the Lucid SDK for receipt verification and epoch querying.
 * Follows the same pattern as passports.ts (SDK calls + error handling).
 *
 * Pipeline: Receipt → Epoch → Chain Anchor → DePIN Archive
 *
 * Usage:
 *   import { getReceipt, verifyReceipt, getReceiptProof, getEpochStats } from '@/lib/ai/receipts'
 */

import 'server-only'
import { lucidSDK, isSDKConfigured, getSDKBaseURL } from './sdk'
import { getLucidProviderConfig } from './lucid-provider-config'
import { ErrorService } from '@/lib/errors/error-service'
import type { Receipt, ReceiptVerification, ReceiptProof, Epoch, EpochStatsResponse } from 'raijin-labs-lucid-ai/models'

export type { Receipt, ReceiptVerification, ReceiptProof, Epoch }

const lucidProviderConfig = getLucidProviderConfig()

// ============================================================================
// RECEIPT READ OPERATIONS
// ============================================================================

/**
 * Fetch a receipt from L2 by run ID.
 *
 * Returns null if not found, SDK not configured, or on error.
 */
export async function getReceipt(runId: string): Promise<Receipt | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.receipts.get({ receiptId: runId })
    return res.receipt ?? null
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { runId },
      tags: { layer: 'ai', domain: 'receipts' },
    })
    return null
  }
}

/**
 * Verify a receipt's cryptographic integrity on L2.
 *
 * Checks:
 * - Receipt hash validity
 * - Signature validity
 * - Merkle inclusion proof (if anchored)
 *
 * Returns null on error.
 */
export async function verifyReceipt(runId: string): Promise<ReceiptVerification | null> {
  if (!isSDKConfigured()) return null
  try {
    return await lucidSDK.receipts.verify({ receiptId: runId })
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { runId },
      tags: { layer: 'ai', domain: 'receipts' },
    })
    return null
  }
}

/**
 * Fetch the Merkle inclusion proof for a receipt.
 *
 * The proof links this receipt to its epoch's MMR root,
 * which is chain-anchored on Solana.
 */
export async function getReceiptProof(runId: string): Promise<ReceiptProof | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.receipts.getProof({ receiptId: runId })
    return res.proof ?? null
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { runId },
      tags: { layer: 'ai', domain: 'receipts' },
    })
    return null
  }
}

// ============================================================================
// EPOCH & ANCHORING OPERATIONS
// ============================================================================

/**
 * Get the current open epoch.
 */
export async function getCurrentEpoch(): Promise<Epoch | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.epochs.getCurrent()
    return res.epoch ?? null
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      tags: { layer: 'ai', domain: 'epochs' },
    })
    return null
  }
}

/**
 * Get epoch statistics (total receipts, by-status counts, avg receipts/epoch).
 */
export async function getEpochStats(): Promise<EpochStatsResponse | null> {
  if (!isSDKConfigured()) return null
  try {
    return await lucidSDK.epochs.getStats()
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      tags: { layer: 'ai', domain: 'epochs' },
    })
    return null
  }
}

/**
 * Fetch recently anchored epochs from L2.
 *
 * Used by the epoch sync cron to discover newly anchored epochs
 * and insert epoch_anchored feed events. Raw fetch because the
 * SDK's list() method returns void (generated incorrectly).
 *
 * L2 response format:
 * - `epoch_id` — epoch identifier
 * - `project_id` — the agent passport ID (used for agent resolution)
 * - `chain_tx` — Record<string, string> mapping chainId → tx signature
 * - `leaf_count` — number of receipts in the epoch
 */
export async function listAnchoredEpochs(limit = 20): Promise<AnchoredEpoch[]> {
  if (!isSDKConfigured()) return []
  const baseUrl = getSDKBaseURL().replace(/\/+$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (lucidProviderConfig.apiKey) {
    headers['Authorization'] = `Bearer ${lucidProviderConfig.apiKey}`
  }
  try {
    const res = await fetch(
      `${baseUrl}/v1/epochs?status=anchored&limit=${limit}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return []
    const data = await res.json()
    const epochs = data.epochs ?? data.data ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return epochs.map((e: any) => {
      // chain_tx can be a string or a Record<string, string> map
      const rawChainTx = e.chain_tx ?? e.chainTx
      let chainTx: string | null = null
      let chain = 'solana-devnet'
      if (typeof rawChainTx === 'string') {
        chainTx = rawChainTx
      } else if (rawChainTx && typeof rawChainTx === 'object') {
        const entries = Object.entries(rawChainTx)
        if (entries.length > 0) {
          chain = entries[0][0]
          chainTx = entries[0][1] as string
        }
      }

      return {
        epochId: e.epoch_id ?? e.epochId,
        projectId: e.project_id ?? e.projectId ?? null,
        chainTx,
        mmrRoot: e.mmr_root ?? e.mmrRoot ?? null,
        leafCount: e.leaf_count ?? e.leafCount ?? null,
        chain,
        anchoredAt: e.anchored_at ?? e.anchoredAt ?? null,
      }
    })
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      tags: { layer: 'ai', domain: 'epochs' },
    })
    return []
  }
}

export interface AnchoredEpoch {
  epochId: string
  /** L2's project_id — typically the agent passport ID */
  projectId: string | null
  chainTx: string | null
  mmrRoot: string | null
  leafCount: number | null
  chain: string
  anchoredAt: string | null
}

/**
 * Get the current MMR (Merkle Mountain Range) root.
 * This is the global receipt tree root, committed on-chain per epoch.
 */
export async function getMmrRoot(): Promise<string | null> {
  if (!isSDKConfigured()) return null
  try {
    const res = await lucidSDK.receipts.getMmrRoot()
    return res.root ?? null
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      tags: { layer: 'ai', domain: 'receipts' },
    })
    return null
  }
}
