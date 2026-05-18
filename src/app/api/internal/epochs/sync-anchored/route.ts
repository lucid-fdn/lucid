/**
 * Epoch Anchoring Sync — Vercel Cron
 *
 * GET /api/internal/epochs/sync-anchored?secret=<CRON_SECRET>
 *
 * Polls L2 for recently anchored epochs, then inserts epoch_anchored events
 * into mc_receipt_events. The live feed subscribes to mc_receipt_events via
 * Supabase Realtime, so inserting there automatically pushes notifications
 * to connected frontends (outbox + poll + push pattern).
 *
 * Flow:
 *   1. Fetch anchored epochs from L2 /v1/epochs?status=anchored
 *   2. For each epoch, resolve the owning agent via passport_id
 *   3. Upsert epoch_anchored event into mc_receipt_events (dedup by epoch_id)
 *
 * Protected by CRON_SECRET or ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { isSDKConfigured, getSDKBaseURL } from '@/lib/ai/sdk'
import { getLucidProviderConfig } from '@/lib/ai/lucid-provider-config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─── Types ───

/**
 * L2 epoch response format (from GET /v1/epochs).
 *
 * L2 returns snake_case. Key field mappings:
 * - `project_id` — can be the agent passport ID (used for agent resolution)
 * - `chain_tx` — Record<string, string> mapping chainId → tx signature
 * - `epoch_id` — the epoch identifier
 */
interface L2EpochRaw {
  epoch_id?: string
  epochId?: string
  project_id?: string
  projectId?: string
  status?: string
  leaf_count?: number
  leafCount?: number
  mmr_root?: string
  mmrRoot?: string
  created_at?: number
  finalized_at?: number
  anchored_at?: string
  anchoredAt?: string
  // L2 returns chain_tx as a map: { "solana-devnet": "tx_sig" }
  chain_tx?: Record<string, string> | string
  chainTx?: Record<string, string> | string
}

interface NormalizedEpoch {
  epochId: string
  passportId: string | null
  chainTx: string | null
  chain: string
  mmrRoot: string | null
  leafCount: number | null
  anchoredAt: string | null
}

/** Normalize L2 epoch response (handles snake_case/camelCase + chain_tx map) */
function normalizeEpoch(raw: L2EpochRaw): NormalizedEpoch {
  const epochId = raw.epoch_id ?? raw.epochId ?? ''
  const projectId = raw.project_id ?? raw.projectId ?? null

  // chain_tx can be a string (simple) or a Record<string, string> (per-chain map)
  let chainTx: string | null = null
  let chain = 'solana-devnet'
  const rawChainTx = raw.chain_tx ?? raw.chainTx
  if (typeof rawChainTx === 'string') {
    chainTx = rawChainTx
  } else if (rawChainTx && typeof rawChainTx === 'object') {
    // Pick the first chain entry (usually solana-devnet)
    const entries = Object.entries(rawChainTx)
    if (entries.length > 0) {
      chain = entries[0][0]
      chainTx = entries[0][1]
    }
  }

  return {
    epochId,
    passportId: projectId,
    chainTx,
    chain,
    mmrRoot: raw.mmr_root ?? raw.mmrRoot ?? null,
    leafCount: raw.leaf_count ?? raw.leafCount ?? null,
    anchoredAt: raw.anchored_at ?? raw.anchoredAt ?? null,
  }
}

// ─── Route Handler ───

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──
    const secret = request.nextUrl.searchParams.get('secret')
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('x-admin-secret')
    const validSecret = secret || headerSecret

    if (!validSecret || (validSecret !== process.env.CRON_SECRET && validSecret !== process.env.ADMIN_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Check L2 availability ──
    if (!isSDKConfigured()) {
      return NextResponse.json({ status: 'skipped', reason: 'L2 SDK not configured' })
    }

    const baseUrl = getSDKBaseURL().replace(/\/+$/, '')

    // ── Poll L2 for anchored epochs ──
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const lucidProviderConfig = getLucidProviderConfig()
    if (lucidProviderConfig.apiKey) {
      headers['Authorization'] = `Bearer ${lucidProviderConfig.apiKey}`
    }

    let epochs: NormalizedEpoch[] = []

    // Try with since param first, fallback to limit-only
    let epochRes = await fetch(
      `${baseUrl}/v1/epochs?status=anchored&since=${encodeURIComponent(fiveMinutesAgo)}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    )

    if (!epochRes.ok && epochRes.status === 400) {
      // Fallback: L2 may not support since param
      epochRes = await fetch(
        `${baseUrl}/v1/epochs?status=anchored&limit=20`,
        { headers, signal: AbortSignal.timeout(15_000) },
      )
    }

    if (!epochRes.ok) {
      return NextResponse.json(
        { error: `L2 returned ${epochRes.status}`, status: 'error' },
        { status: 502 },
      )
    }

    const epochBody = await epochRes.json()
    const rawEpochs: L2EpochRaw[] = Array.isArray(epochBody)
      ? epochBody
      : (epochBody.data ?? epochBody.epochs ?? [])
    epochs = rawEpochs.map(normalizeEpoch)

    if (epochs.length === 0) {
      return NextResponse.json({ status: 'ok', synced: 0, skipped: 0, message: 'No anchored epochs found' })
    }

    // ── Resolve agents by passport_id (L2 returns project_id which is the passport ID) ──
    const passportIds = [...new Set(epochs.map(e => e.passportId).filter(Boolean))] as string[]

    const agentMap = new Map<string, { id: string; org_id: string }>()

    if (passportIds.length > 0) {
      const { data: agents, error: agentsErr } = await supabase
        .from('ai_assistants')
        .select('id, org_id, passport_id')
        .in('passport_id', passportIds)
        .eq('is_active', true)

      if (agentsErr) {
        ErrorService.captureException(agentsErr, {
          severity: 'warning',
          context: { endpoint: '/api/internal/epochs/sync-anchored', step: 'fetch-agents' },
          tags: { layer: 'api', route: 'epoch-sync' },
        })
      }

      if (agents) {
        for (const a of agents) {
          if (a.passport_id && a.org_id) {
            agentMap.set(a.passport_id, { id: a.id, org_id: a.org_id })
          }
        }
      }
    }

    // ── Insert epoch_anchored events ──
    let synced = 0
    let skipped = 0

    for (const epoch of epochs) {
      if (!epoch.epochId) {
        skipped++
        continue
      }

      const agent = epoch.passportId ? agentMap.get(epoch.passportId) : undefined
      if (!agent) {
        skipped++
        continue
      }

      const payload = {
        epoch_id: epoch.epochId,
        chain_tx: epoch.chainTx,
        mmr_root: epoch.mmrRoot,
        receipt_count: epoch.leafCount,
        chain: epoch.chain,
        anchored_at: epoch.anchoredAt ?? new Date().toISOString(),
      }

      try {
        const { error: insertErr } = await supabase.from('mc_receipt_events').insert({
          agent_id: agent.id,
          org_id: agent.org_id,
          event_type: 'epoch_anchored',
          run_id: null,
          payload,
        })

        if (insertErr) {
          // Unique index violation means already synced — count as skipped
          if (insertErr.code === '23505') {
            skipped++
          } else {
            ErrorService.captureException(insertErr, {
              severity: 'warning',
              context: { endpoint: '/api/internal/epochs/sync-anchored', epochId: epoch.epochId },
              tags: { layer: 'db', route: 'epoch-sync' },
            })
            skipped++
          }
        } else {
          synced++
        }
      } catch {
        skipped++
      }
    }

    return NextResponse.json({ status: 'ok', synced, skipped, total: epochs.length })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/internal/epochs/sync-anchored' },
      tags: { layer: 'api', route: 'epoch-sync' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
