/**
 * GET /api/internal/skills/reconcile
 * Cron-safe reconcile endpoint for canonical skill publishing + mirror sync.
 *
 * Recommended schedule: every 5-15 minutes via Vercel cron or QStash.
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
 */

import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'
import { reconcileSkillCatalog } from '@/lib/skills/reconcile'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const authHeader = request.headers.get('authorization')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized or CRON_SECRET not configured' }, { status: 401 })
  }

  const requestedMode = request.nextUrl.searchParams.get('mode')
  const mode = requestedMode === 'publish' || requestedMode === 'sync' || requestedMode === 'publish_and_sync'
    ? requestedMode
    : 'publish_and_sync'

  try {
    const result = await reconcileSkillCatalog(mode)
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/skills/reconcile', mode },
      tags: { layer: 'cron', job: 'skills-reconcile' },
    })

    return NextResponse.json({
      error: 'Skill reconcile failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
