import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { createClient } from '@/lib/supabase/server'
import { getUsageMetrics } from '@/lib/db'
import { getUsageStatus } from '@/lib/plans'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/usage
 * Get usage metrics for current org
 * 
 * Query params:
 * - org_id: Organization ID (required)
 * - metric: Specific metric name (optional, returns all if not provided)
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
    const metric = searchParams.get('metric')
    
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

    // Get specific metric status
    if (metric) {
      const status = await getUsageStatus(orgId, metric)
      return NextResponse.json({ 
        metric,
        ...status 
      })
    }
    
    // Get all metrics for current period
    const metrics = await getUsageMetrics(orgId)
    
    // Get detailed status for common metrics
    const [
      apiCallsStatus,
      storageStatus,
      aiQueriesStatus
    ] = await Promise.all([
      getUsageStatus(orgId, 'api_calls_monthly'),
      getUsageStatus(orgId, 'storage_gb'),
      getUsageStatus(orgId, 'ai_queries_monthly')
    ])
    
    return NextResponse.json({
      metrics,
      status: {
        api_calls_monthly: apiCallsStatus,
        storage_gb: storageStatus,
        ai_queries_monthly: aiQueriesStatus
      }
    })
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/usage/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    )
  }
}
