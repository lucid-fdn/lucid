/**
 * GET /api/internal/entitlements/reconcile
 * Cron: Runs daily. Reconciles usage_metrics against actual DB counts.
 * Corrects drift from failed fire-and-forget increments.
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
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Get all orgs with active subscriptions
    const { data: orgs, error: orgsError } = await getSupabase()
      .from('subscriptions')
      .select('org_id')
      .in('status', ['active', 'trialing'])

    if (orgsError) throw orgsError

    const corrections: Array<{ orgId: string; metric: string; reported: number; actual: number }> = []

    for (const { org_id: orgId } of orgs || []) {
      // Reconcile ai_queries_monthly: count actual messages sent by org's assistants this period
      // We count assistant_inbound_events with status='done' as processed queries
      const { count: actualQueries } = await getSupabase()
        .from('assistant_inbound_events')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done')
        .gte('created_at', periodStart.toISOString())
        .lte('created_at', periodEnd.toISOString())
        .in('assistant_id',
          (await getSupabase()
            .from('ai_assistants')
            .select('id')
            .eq('org_id', orgId)
          ).data?.map(a => a.id) || []
        )

      // Get reported usage
      const { data: reported } = await getSupabase()
        .from('usage_metrics')
        .select('metric_value')
        .eq('org_id', orgId)
        .eq('metric_name', 'ai_queries_monthly')
        .gte('period_start', periodStart.toISOString())
        .lte('period_end', periodEnd.toISOString())
        .maybeSingle()

      const reportedValue = reported?.metric_value ?? 0
      const actualValue = actualQueries ?? 0

      // Only correct if drift > 5% and reported is LOWER than actual
      // (we never want to reduce reported usage — that could allow abuse)
      if (actualValue > reportedValue && (actualValue - reportedValue) / Math.max(actualValue, 1) > 0.05) {
        corrections.push({
          orgId,
          metric: 'ai_queries_monthly',
          reported: reportedValue,
          actual: actualValue,
        })

        // Correct by setting to actual value
        await getSupabase()
          .from('usage_metrics')
          .upsert({
            org_id: orgId,
            metric_name: 'ai_queries_monthly',
            metric_value: actualValue,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
          }, {
            onConflict: 'org_id,metric_name,period_start,period_end',
          })

        ErrorService.captureException(
          new Error(`Usage drift corrected: ${reportedValue} → ${actualValue}`),
          {
            severity: 'warning',
            context: {
              event: 'usage_reconciliation',
              orgId,
              metric: 'ai_queries_monthly',
              reported: reportedValue,
              actual: actualValue,
              drift: actualValue - reportedValue,
            },
            tags: { layer: 'cron', job: 'reconcile' },
          }
        )
      }
    }

    console.log(`[cron] Reconciliation complete: ${corrections.length} corrections across ${orgs?.length ?? 0} orgs`)

    return NextResponse.json({
      orgsChecked: orgs?.length ?? 0,
      corrections: corrections.length,
      details: corrections,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/entitlements/reconcile' },
      tags: { layer: 'cron', job: 'reconcile' },
    })
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
