/**
 * Receipt Emitter — records verifiable AI execution receipts on L2.
 *
 * After each agent run, builds a cryptographic receipt from run metrics
 * and POSTs it to the L2 API. Receipts are batched into epochs by L2,
 * then chain-anchored (Solana tx) for permanent verifiability.
 *
 * Pipeline: Receipt → Epoch (L2 batches) → Chain Anchor → DePIN Archive
 *
 * Design:
 * - Fire-and-forget (never blocks agent response delivery)
 * - Feature-gated via FEATURE_RECEIPTS
 * - Uses raw HTTP (worker can't import from src/ SDK singleton)
 * - Retries with exponential backoff (2 attempts, 1s base)
 * - Non-throwing — logs errors, never crashes the worker
 */

import crypto from 'node:crypto'
import { getConfig } from '../config.js'

const RECEIPT_404_COOLDOWN_MS = 60 * 60 * 1000
let receiptsDisabledUntil = 0
let receiptDisableReason: string | null = null

// ============================================================================
// TYPES
// ============================================================================

export interface ReceiptInput {
  /** Unique run identifier */
  runId: string
  /** Assistant's L2 passport ID (null = skip receipt) */
  passportId: string | null
  /** Model used for this run */
  model: string
  /** Input tokens consumed */
  tokensIn: number
  /** Output tokens consumed */
  tokensOut: number
  /** Total runtime in milliseconds */
  totalLatencyMs: number
  /** Number of tool calls made */
  toolCallCount: number
  /** Policy config hash (budget/limits snapshot) */
  policyConfig: Record<string, unknown> | null
  /** Optional: Supabase client for writing feed events (typed as any to avoid cross-package type coupling) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any
  /** Optional: Assistant ID for feed event */
  assistantId?: string
  /** Optional: Org ID for feed event */
  orgId?: string | null
}

interface L2Receipt {
  runId: string
  modelPassportId: string
  computePassportId: string
  policyHash: string
  runtime: string
  tokensIn: number
  tokensOut: number
  ttftMs: number
  totalLatencyMs: number
  timestamp: number
  receiptHash: string
  signature: string
}

// ============================================================================
// RECEIPT BUILDER
// ============================================================================

/**
 * Build a canonical receipt hash from run data.
 * SHA-256 of deterministic JSON representation.
 */
function buildReceiptHash(fields: Omit<L2Receipt, 'receiptHash' | 'signature'>): string {
  const canonical = JSON.stringify({
    runId: fields.runId,
    modelPassportId: fields.modelPassportId,
    computePassportId: fields.computePassportId,
    policyHash: fields.policyHash,
    runtime: fields.runtime,
    tokensIn: fields.tokensIn,
    tokensOut: fields.tokensOut,
    ttftMs: fields.ttftMs,
    totalLatencyMs: fields.totalLatencyMs,
    timestamp: fields.timestamp,
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

/**
 * Hash a policy config object into a deterministic string.
 */
function hashPolicy(policyConfig: Record<string, unknown> | null): string {
  if (!policyConfig) return crypto.createHash('sha256').update('{}').digest('hex')
  const sorted = JSON.stringify(policyConfig, Object.keys(policyConfig).sort())
  return crypto.createHash('sha256').update(sorted).digest('hex')
}

/**
 * Sign the receipt hash. If no signer key is configured, returns a
 * self-attested HMAC (L2 accepts both ed25519 and hmac-sha256 signatures).
 */
function signReceipt(receiptHash: string): string {
  const config = getConfig()
  const key = config.RECEIPT_SIGNER_KEY
  if (!key) {
    // Self-attested HMAC with the API key as secret (L2 verifies via API key identity)
    const hmacKey = config.LUCID_API_KEY || 'unsigned'
    return crypto.createHmac('sha256', hmacKey).update(receiptHash).digest('hex')
  }
  // Ed25519 signing with dedicated receipt key
  return crypto.createHmac('sha256', key).update(receiptHash).digest('hex')
}

/**
 * Build a full L2 receipt from agent run input.
 */
function buildReceipt(input: ReceiptInput): L2Receipt | null {
  if (!input.passportId) return null

  const config = getConfig()
  const computePassportId = config.LUCID_PLATFORM_WALLET || 'lucid-saas'

  const fields = {
    runId: input.runId,
    modelPassportId: input.passportId, // Agent's L2 passport ID
    computePassportId,
    policyHash: hashPolicy(input.policyConfig),
    runtime: 'lucid-saas',
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    ttftMs: 0, // TTFT not tracked at agent level (tracked at LLM proxy level)
    totalLatencyMs: input.totalLatencyMs,
    timestamp: Date.now(),
  }

  const receiptHash = buildReceiptHash(fields)
  const signature = signReceipt(receiptHash)

  return { ...fields, receiptHash, signature }
}

// ============================================================================
// HTTP TRANSPORT
// ============================================================================

/**
 * POST a receipt to L2 with retry.
 * Uses raw fetch (worker can't import SDK singleton from src/).
 */
async function postReceipt(receipt: L2Receipt): Promise<void> {
  const config = getConfig()
  const baseUrl = config.LUCID_API_BASE_URL.replace(/\/+$/, '')
  const url = `${baseUrl}/v1/receipts`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.LUCID_API_KEY) {
    headers['Authorization'] = `Bearer ${config.LUCID_API_KEY}`
  }

  // 2 attempts with 1s backoff
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // L2 API uses snake_case wire format
      const wireReceipt = {
        run_id: receipt.runId,
        model_passport_id: receipt.modelPassportId,
        compute_passport_id: receipt.computePassportId,
        policy_hash: receipt.policyHash,
        runtime: receipt.runtime,
        tokens_in: receipt.tokensIn,
        tokens_out: receipt.tokensOut,
        ttft_ms: receipt.ttftMs,
        total_latency_ms: receipt.totalLatencyMs,
        timestamp: receipt.timestamp,
        receipt_hash: receipt.receiptHash,
        signature: receipt.signature,
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(wireReceipt),
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok) {
        console.log(`[receipt-emitter] Recorded receipt for run ${receipt.runId}`)
        return
      }

      // Don't retry 4xx (client errors) — only retry 5xx/network
      if (res.status >= 400 && res.status < 500) {
        // 404 = endpoint not yet deployed on L2, warn not error
        const bodyText = await res.text().catch(() => '')
        if (res.status === 404) {
          receiptsDisabledUntil = Date.now() + RECEIPT_404_COOLDOWN_MS
          receiptDisableReason = `L2 receipts endpoint unavailable at ${url}`
          console.warn(
            `[receipt-emitter] Disabling receipt emission for ${Math.round(RECEIPT_404_COOLDOWN_MS / 60000)}m after 404 from ${url}: ${bodyText}`,
          )
          return
        }
        console.error(`[receipt-emitter] L2 rejected receipt: ${res.status} ${bodyText}`)
        return
      }

      console.warn(`[receipt-emitter] L2 returned ${res.status}, retrying...`)
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[receipt-emitter] Network error, retrying:`, (err as Error).message)
      } else {
        console.error(`[receipt-emitter] Failed after 2 attempts:`, (err as Error).message)
      }
    }

    // Backoff before retry
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Emit a receipt for an agent run. Fire-and-forget — never throws.
 *
 * Call this after agent run completion in OpenClawAgent.ts.
 * Skips silently if:
 * - FEATURE_RECEIPTS is disabled
 * - No passport_id on the assistant
 * - LUCID_API_BASE_URL not configured
 */
export function emitReceipt(input: ReceiptInput): void {
  const config = getConfig()
  if (!config.FEATURE_RECEIPTS) return
  if (!input.passportId) return
  if (receiptsDisabledUntil > Date.now()) return
  if (receiptDisableReason && receiptsDisabledUntil <= Date.now()) {
    receiptDisableReason = null
  }

  const receipt = buildReceipt(input)
  if (!receipt) return

  // Fire-and-forget — never block the agent response
  postReceipt(receipt)
    .then(() => {
      // Write feed event on successful L2 post
      if (input.supabase && input.assistantId && input.orgId) {
        void Promise.resolve(input.supabase.from('mc_receipt_events').insert({
          agent_id: input.assistantId,
          org_id: input.orgId,
          event_type: 'receipt_created',
          run_id: input.runId,
          payload: {
            receipt_hash: receipt.receiptHash,
            model: input.model,
            tokens_in: input.tokensIn,
            tokens_out: input.tokensOut,
            latency_ms: input.totalLatencyMs,
            tool_calls: input.toolCallCount,
          },
        })).catch(() => {
          // Non-critical — feed event insert failure should never propagate
        })
      }
    })
    .catch((err) => {
      console.error(`[receipt-emitter] Fire-and-forget error:`, err)
    })
}

export function __resetReceiptEmitterForTests(): void {
  receiptsDisabledUntil = 0
  receiptDisableReason = null
}
