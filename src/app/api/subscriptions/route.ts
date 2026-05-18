import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { createClient } from '@/lib/supabase/server'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getOrgSubscription,
  getUsageMetrics,
  getPaymentHistory
} from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscriptions
 * Get subscription details for current org
 * 
 * Query params:
 * - org_id: Organization ID
 * - include_usage: Include usage metrics (optional)
 * - include_payments: Include payment history (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('org_id')
    const includeUsage = searchParams.get('include_usage') === 'true'
    const includePayments = searchParams.get('include_payments') === 'true'
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      )
    }

    // Verify user belongs to this org
    const supabase = await createClient()
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get subscription
    const subscription = await getOrgSubscription(orgId)
    
    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }
    
    // Build response
    const response: Record<string, unknown> = {
      subscription
    }
    
    // Include usage metrics if requested
    if (includeUsage) {
      const usage = await getUsageMetrics(orgId)
      response.usage = usage
    }
    
    // Include payment history if requested
    if (includePayments) {
      const payments = await getPaymentHistory(orgId, 10)
      response.payments = payments
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/subscriptions/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    )
  }
}

