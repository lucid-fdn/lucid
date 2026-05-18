/**
 * GET /api/internal/entitlements/usage-alerts
 * Cron: Runs every 6 hours. Sends email alerts at 80% and 95% usage thresholds.
 * Uses deduplication to avoid sending the same alert twice in a billing period.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'
import { getEntitlementStatus } from '@/lib/entitlements'

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
    // Get all orgs with active subscriptions
    const { data: orgs, error: orgsError } = await getSupabase()
      .from('subscriptions')
      .select('org_id, organizations!inner(id, name)')
      .in('status', ['active', 'trialing'])

    if (orgsError) throw orgsError

    let alertsSent = 0

    for (const org of orgs || []) {
      const orgId = org.org_id
      const orgName = (org.organizations as unknown as { name: string })?.name || 'Your organization'

      const status = await getEntitlementStatus(orgId)

      for (const item of status.items) {
        if (item.isUnlimited || item.status === 'normal') continue

        // Determine threshold level
        const threshold = item.status === 'blocked' ? 100
          : item.status === 'warning_95' ? 95
          : item.status === 'warning_80' ? 80
          : null

        if (!threshold) continue

        // Dedupe: check if we already sent this alert this period
        const now = new Date()
        const periodKey = `${now.getFullYear()}-${now.getMonth()}`
        const dedupeKey = `usage-alert:${orgId}:${item.metric}:${threshold}:${periodKey}`

        const { data: existing } = await getSupabase()
          .from('emails')
          .select('id')
          .eq('dedupe_key', dedupeKey)
          .eq('status', 'sent')
          .maybeSingle()

        if (existing) continue // Already sent this alert

        // Get org admins/owners to notify
        const { data: members } = await getSupabase()
          .from('organization_members')
          .select('user_id, role, profiles!inner(email)')
          .eq('organization_id', orgId)
          .in('role', ['owner', 'admin'])

        if (!members?.length) continue

        // Send alert email to each admin
        const { sendTransactional } = await import('@/lib/mail')
        const remaining = Math.max(0, item.max - item.current)
        const metricLabel = item.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

        for (const member of members) {
          const email = (member.profiles as unknown as { email: string })?.email
          if (!email) continue

          try {
            await sendTransactional('alert', email, {
              title: threshold >= 100
                ? `${metricLabel} limit reached`
                : `${metricLabel} at ${threshold}% usage`,
              message: threshold >= 100
                ? `${orgName} has reached its ${metricLabel.toLowerCase()} limit (${item.current}/${item.max}). Upgrade your plan to continue using this feature.`
                : `${orgName} has used ${threshold}% of its ${metricLabel.toLowerCase()} allocation (${item.current}/${item.max}). ${remaining} remaining.`,
              actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?upgrade=pro`,
              actionLabel: threshold >= 100 ? 'Upgrade Now' : 'View Usage',
            }, {
              dedupeKey,
            })
            alertsSent++
          } catch (err) {
            ErrorService.captureException(err as Error, {
              severity: 'warning',
              context: { orgId, metric: item.metric, threshold, email },
              tags: { layer: 'cron', job: 'usage-alerts' },
            })
          }
        }
      }
    }

    console.log(`[cron] Usage alerts: sent ${alertsSent} alerts across ${orgs?.length ?? 0} orgs`)

    return NextResponse.json({
      orgsChecked: orgs?.length ?? 0,
      alertsSent,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/entitlements/usage-alerts' },
      tags: { layer: 'cron', job: 'usage-alerts' },
    })
    return NextResponse.json({ error: 'Usage alerts failed' }, { status: 500 })
  }
}
