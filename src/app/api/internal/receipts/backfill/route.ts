/**
 * Receipt Backfill
 *
 * GET /api/internal/receipts/backfill?secret=<CRON_SECRET>&limit=50&dryRun=true
 *
 * Generates L2 receipts from historical cost tracking data for agents
 * that have a passport but no receipts yet.
 *
 * Flow:
 *   1. Find agents with passport_id + cost tracking data
 *   2. For each agent/day pair, POST a receipt to L2 (snake_case wire format)
 *   3. Emit mc_receipt_events feed events
 *
 * Idempotent — uses deterministic runId (backfill:{agentId}:{date}) so
 * L2 deduplicates if the same receipt is submitted twice.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { insertReceiptEvent } from '@/lib/db/mission-control'
import { getLucidProviderConfig } from '@/lib/ai/lucid-provider-config'
import { getPassportOwnerFallback } from '@/lib/lucid-l2/env'

export const dynamic = 'force-dynamic'

// ─── Config ───

const lucidProviderConfig = getLucidProviderConfig()
const L2_BASE_URL = lucidProviderConfig.baseUrl.replace(/\/+$/, '')
const L2_API_KEY = lucidProviderConfig.apiKey
const COMPUTE_PASSPORT_ID = getPassportOwnerFallback() || 'lucid-saas'
const RECEIPT_SIGNER_KEY = process.env.RECEIPT_SIGNER_KEY

// ─── Helpers ───

function signReceipt(receiptHash: string): string {
  const key = RECEIPT_SIGNER_KEY || L2_API_KEY || 'unsigned'
  return crypto.createHmac('sha256', key).update(receiptHash).digest('hex')
}

// ─── Route Handler ───

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get('limit') || '50'),
      500,
    )
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

    // Find agents with passports that have cost tracking data
    const { data: agents, error: agentsErr } = await supabase
      .from('ai_assistants')
      .select('id, name, org_id, passport_id, lucid_model')
      .not('passport_id', 'is', null)
      .eq('is_active', true)
      .not('org_id', 'is', null)
      .order('created_at', { ascending: true })

    if (agentsErr) {
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No agents with passports found', receipts: 0 })
    }

    // Get cost tracking data for these agents
    const agentIds = agents.map(a => a.id)
    const { data: costRows, error: costErr } = await supabase
      .from('mc_agent_cost_tracking')
      .select('agent_id, date, tokens_input, tokens_output, estimated_cost_usd, run_count')
      .in('agent_id', agentIds)
      .order('date', { ascending: true })
      .limit(limit)

    if (costErr) {
      return NextResponse.json({ error: 'Failed to fetch cost data' }, { status: 500 })
    }

    if (!costRows || costRows.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No cost tracking data found', receipts: 0 })
    }

    // Build agent lookup
    const agentMap = new Map(agents.map(a => [a.id, a]))

    let emitted = 0
    let failed = 0
    let skipped = 0
    const results: Array<{ agentId: string; date: string; status: string }> = []

    for (const row of costRows) {
      const agent = agentMap.get(row.agent_id)
      if (!agent?.passport_id || !agent?.org_id) {
        skipped++
        continue
      }

      const runId = `backfill:${row.agent_id}:${row.date}`
      const tokensIn = Number(row.tokens_input) || 0
      const tokensOut = Number(row.tokens_output) || 0
      const totalLatencyMs = (row.run_count || 1) * 5000
      const timestamp = new Date(row.date).getTime()
      const policyHash = crypto.createHash('sha256').update('{}').digest('hex')

      // Build deterministic hash for idempotency
      const canonical = JSON.stringify({
        runId, modelPassportId: agent.passport_id, computePassportId: COMPUTE_PASSPORT_ID,
        policyHash, runtime: 'lucid-saas', tokensIn, tokensOut, ttftMs: 0, totalLatencyMs, timestamp,
      })
      const receiptHash = crypto.createHash('sha256').update(canonical).digest('hex')
      const signature = signReceipt(receiptHash)

      if (dryRun) {
        results.push({ agentId: row.agent_id, date: row.date, status: 'dry-run' })
        emitted++
        continue
      }

      // POST to L2 — snake_case wire format
      try {
        const res = await fetch(`${L2_BASE_URL}/v1/receipts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(L2_API_KEY && { Authorization: `Bearer ${L2_API_KEY}` }),
          },
          body: JSON.stringify({
            run_id: runId,
            model_passport_id: agent.passport_id,
            compute_passport_id: COMPUTE_PASSPORT_ID,
            policy_hash: policyHash,
            runtime: 'lucid-saas',
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            ttft_ms: 0,
            total_latency_ms: totalLatencyMs,
            timestamp,
            receipt_hash: receiptHash,
            signature,
          }),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok || res.status === 409) {
          emitted++
          results.push({ agentId: row.agent_id, date: row.date, status: res.status === 409 ? 'duplicate' : 'created' })

          // Emit feed event (fire-and-forget)
          insertReceiptEvent({
            agentId: row.agent_id,
            orgId: agent.org_id,
            eventType: 'receipt_created',
            runId,
            payload: {
              receipt_hash: receiptHash,
              model: agent.lucid_model || 'unknown',
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              backfill: true,
              date: row.date,
              run_count: row.run_count,
            },
          }).catch(() => {})
        } else {
          failed++
          results.push({ agentId: row.agent_id, date: row.date, status: `error:${res.status}` })
        }
      } catch {
        failed++
        results.push({ agentId: row.agent_id, date: row.date, status: 'network-error' })
      }
    }

    return NextResponse.json({
      status: 'ok',
      dryRun,
      total: costRows.length,
      emitted,
      failed,
      skipped,
      results: results.slice(0, 100),
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/internal/receipts/backfill' },
      tags: { layer: 'api', route: 'receipts-backfill' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
