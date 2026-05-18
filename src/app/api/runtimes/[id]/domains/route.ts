import { NextRequest, NextResponse } from 'next/server'
import { proxyToL2 } from '../../_l2-proxy'
import { ErrorService } from '@/lib/errors/error-service'
import { addDomainSchema, domainInfoSchema } from '@/lib/mission-control/schemas'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// GET /api/runtimes/[id]/domains?org_id=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const { id } = await params
    const result = await proxyToL2({ runtimeId: id, orgId, path: 'domains' })
    if (!result.ok) {
      return NextResponse.json({
        domains: [],
        message: 'Custom domain status is temporarily unavailable',
      })
    }

    const data = result.data as Record<string, unknown>
    const domainsRaw = Array.isArray(data?.domains) ? data.domains : []
    const parsed = z.array(domainInfoSchema).safeParse(domainsRaw)

    return NextResponse.json({ domains: parsed.success ? parsed.data : domainsRaw })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/domains GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/runtimes/[id]/domains?org_id=xxx
// Body: { domain: "example.com" }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = addDomainSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid domain', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id } = await params
    const result = await proxyToL2({
      runtimeId: id,
      orgId,
      path: 'domains',
      method: 'POST',
      body: parsed.data,
    })
    if (!result.ok) return result.response

    const data = result.data as Record<string, unknown>
    const domainParsed = domainInfoSchema.safeParse(data?.domain ?? data)

    return NextResponse.json(
      { domain: domainParsed.success ? domainParsed.data : data },
      { status: 201 }
    )
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/domains POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
