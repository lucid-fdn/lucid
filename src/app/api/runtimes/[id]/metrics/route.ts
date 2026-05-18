import { NextRequest, NextResponse } from 'next/server'
import { proxyToL2 } from '../../_l2-proxy'
import { ErrorService } from '@/lib/errors/error-service'
import { deploymentMetricsSchema, metricsQuerySchema } from '@/lib/mission-control/schemas'

export const dynamic = 'force-dynamic'

// GET /api/runtimes/[id]/metrics?org_id=xxx&range=3600&granularity=minute
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const queryParse = metricsQuerySchema.safeParse({
      range: request.nextUrl.searchParams.get('range') ?? undefined,
      granularity: request.nextUrl.searchParams.get('granularity') ?? undefined,
    })

    const { id } = await params
    const queryParts: string[] = []
    if (queryParse.success) {
      if (queryParse.data.range) queryParts.push(`range=${queryParse.data.range}`)
      if (queryParse.data.granularity) queryParts.push(`granularity=${queryParse.data.granularity}`)
    }

    const result = await proxyToL2({
      runtimeId: id,
      orgId,
      path: 'metrics',
      query: queryParts.join('&') || undefined,
    })

    if (!result.ok) return result.response

    // Validate L2 response shape
    const parsed = deploymentMetricsSchema.safeParse(result.data)
    return NextResponse.json({ metrics: parsed.success ? parsed.data : result.data })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/metrics GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
