/**
 * Passport Backfill
 *
 * GET /api/internal/passports/backfill?secret=<CRON_SECRET>&limit=50
 *
 * Provisions L2 passports for assistants that don't have one.
 * Catches up assistants created while L2 was down or before the integration existed.
 * Should be called periodically by Vercel Cron or external scheduler.
 *
 * Idempotent — safe to run as often as needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'
import { supabase } from '@/lib/db/client'
import { ensureAssistantPassport, triggerOnChainSync, getAgentPassport } from '@/lib/ai/passports'
import { insertReceiptEvent } from '@/lib/db/mission-control'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get('limit') || '50'),
      200,
    )
    const action = request.nextUrl.searchParams.get('action') || 'provision'

    // ── Action: sync — trigger on-chain sync for passports missing PDA ──
    if (action === 'sync') {
      const { data: assistants, error } = await supabase
        .from('ai_assistants')
        .select('id, name, passport_id, org_id')
        .not('passport_id', 'is', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) {
        return NextResponse.json({ error: 'DB query failed' }, { status: 500 })
      }

      if (!assistants || assistants.length === 0) {
        return NextResponse.json({ status: 'ok', synced: 0, skipped: 0, total: 0 })
      }

      let synced = 0
      let skipped = 0
      let alreadySynced = 0

      for (const assistant of assistants) {
        if (!assistant.passport_id) { skipped++; continue }

        // Check if already has on-chain data
        const passport = await getAgentPassport(assistant.passport_id).catch(() => null)
        if (passport?.onChain?.pda) {
          alreadySynced++
          continue
        }

        // Trigger sync
        const result = await triggerOnChainSync(assistant.passport_id).catch(() => null)
        if (result?.pda) {
          synced++
        } else {
          skipped++
        }
      }

      return NextResponse.json({
        status: 'ok',
        action: 'sync',
        total: assistants.length,
        synced,
        alreadySynced,
        skipped,
      })
    }

    // ── Action: provision — create passports for assistants missing one ──

    // Find active assistants missing a passport, oldest first
    const { data: assistants, error } = await supabase
      .from('ai_assistants')
      .select('id, name, description, passport_id, org_id')
      .is('passport_id', null)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: '/api/internal/passports/backfill' },
        tags: { layer: 'api', route: 'passports-backfill' },
      })
      return NextResponse.json({ error: 'DB query failed' }, { status: 500 })
    }

    if (!assistants || assistants.length === 0) {
      return NextResponse.json({ status: 'ok', provisioned: 0, total: 0 })
    }

    let provisioned = 0
    let failed = 0

    // Process sequentially to avoid L2 rate limits
    for (const assistant of assistants) {
      const passportId = await ensureAssistantPassport({
        assistantId: assistant.id,
        existingPassportId: assistant.passport_id,
        name: assistant.name,
        description: assistant.description,
        orgId: assistant.org_id ?? undefined,
      })
      if (passportId) {
        provisioned++
        // Emit feed event (fire-and-forget)
        if (assistant.org_id) {
          insertReceiptEvent({
            agentId: assistant.id,
            orgId: assistant.org_id,
            eventType: 'passport_provisioned',
            payload: {
              passport_id: passportId,
              passport_name: assistant.name,
              backfill: true,
            },
          }).catch(() => {})
        }
      } else {
        failed++
      }
    }

    return NextResponse.json({
      status: 'ok',
      total: assistants.length,
      provisioned,
      failed,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/internal/passports/backfill' },
      tags: { layer: 'api', route: 'passports-backfill' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
