/**
 * GET /api/internal/entitlements/cleanup-idempotency
 * Cron: Runs daily. Removes expired idempotency keys (>24h old).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data, error } = await getSupabase().rpc('cleanup_usage_idempotency_keys', {
      p_max_age: '24 hours',
    })

    if (error) throw error

    console.log(`[cron] Cleaned up ${data ?? 0} expired idempotency keys`)

    return NextResponse.json({ deleted: data ?? 0 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/entitlements/cleanup-idempotency' },
      tags: { layer: 'cron', job: 'cleanup-idempotency' },
    })
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
